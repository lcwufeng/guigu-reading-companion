#!/usr/bin/env swift

import AppKit
import Foundation
import PDFKit
import Vision

struct OCRBox: Codable {
    let text: String
    let confidence: Float
    let x: Double
    let y: Double
    let width: Double
    let height: Double
}

struct OCRPage: Codable {
    let path: String
    let page: Int?
    let width: Int
    let height: Int
    let boxes: [OCRBox]
}

func cjkCount(_ text: String) -> Int {
    text.unicodeScalars.reduce(0) { count, scalar in
        (0x3400...0x9FFF).contains(Int(scalar.value)) ? count + 1 : count
    }
}

func refinePinyinLine(_ observation: VNRecognizedTextObservation, in image: CGImage) -> (String, Float)? {
    guard ProcessInfo.processInfo.environment["OCR_REFINE_PINYIN"] == "1",
          let original = observation.topCandidates(1).first,
          cjkCount(original.string) > 0,
          (observation.boundingBox.height > 0.043 || original.confidence < 0.65) else { return nil }

    let box = observation.boundingBox
    let fullX = box.origin.x * Double(image.width)
    let fullTop = (1 - box.origin.y - box.height) * Double(image.height)
    let fullWidth = box.width * Double(image.width)
    let fullHeight = box.height * Double(image.height)
    let crop = CGRect(
        x: max(0, fullX - 6),
        y: max(0, fullTop + fullHeight * 0.34),
        width: min(Double(image.width) - max(0, fullX - 6), fullWidth + 12),
        height: min(Double(image.height) - max(0, fullTop + fullHeight * 0.34), fullHeight * 0.66 + 4)
    ).integral
    guard crop.width > 12, crop.height > 10, let lineImage = image.cropping(to: crop) else { return nil }

    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = true
    request.recognitionLanguages = ["zh-Hans", "zh-Hant"]
    request.minimumTextHeight = 0
    do {
        try VNImageRequestHandler(cgImage: lineImage, options: [:]).perform([request])
    } catch {
        return nil
    }
    let candidates = (request.results ?? [])
        .sorted { $0.boundingBox.origin.x < $1.boundingBox.origin.x }
        .compactMap { $0.topCandidates(1).first }
    guard !candidates.isEmpty else { return nil }
    let text = candidates.map(\.string).joined()
    let confidence = candidates.map(\.confidence).reduce(0, +) / Float(candidates.count)
    guard cjkCount(text) >= max(2, cjkCount(original.string) / 2), confidence >= original.confidence - 0.2 else { return nil }
    return (text, confidence)
}

func recognize(_ cgImage: CGImage, path: String, page: Int? = nil) throws -> OCRPage {
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = true
    request.recognitionLanguages = ProcessInfo.processInfo.environment["OCR_CHINESE_ONLY"] == "1"
        ? ["zh-Hans", "zh-Hant"]
        : ["zh-Hans", "zh-Hant", "en-US"]
    request.minimumTextHeight = Float(ProcessInfo.processInfo.environment["OCR_MIN_TEXT_HEIGHT"] ?? "0.006") ?? 0.006

    let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
    try handler.perform([request])

    let boxes = (request.results ?? []).compactMap { observation -> OCRBox? in
        guard let original = observation.topCandidates(1).first else { return nil }
        let refined = refinePinyinLine(observation, in: cgImage)
        let box = observation.boundingBox
        return OCRBox(
            text: refined?.0 ?? original.string,
            confidence: refined?.1 ?? original.confidence,
            x: box.origin.x,
            y: box.origin.y,
            width: box.size.width,
            height: box.size.height
        )
    }.sorted {
        if abs($0.y - $1.y) > 0.008 { return $0.y > $1.y }
        return $0.x < $1.x
    }

    return OCRPage(path: path, page: page, width: cgImage.width, height: cgImage.height, boxes: boxes)
}

func recognizeImage(_ path: String) throws -> OCRPage {
    let url = URL(fileURLWithPath: path)
    guard let image = NSImage(contentsOf: url),
          let data = image.tiffRepresentation,
          let bitmap = NSBitmapImageRep(data: data),
          let cgImage = bitmap.cgImage else {
        throw NSError(domain: "VisionOCR", code: 1, userInfo: [NSLocalizedDescriptionKey: "无法读取图片：\(path)"])
    }
    return try recognize(cgImage, path: path)
}

func pageImage(_ page: PDFPage, targetWidth: CGFloat) -> CGImage? {
    let bounds = page.bounds(for: .mediaBox)
    let scale = targetWidth / max(bounds.width, 1)
    let width = Int(targetWidth.rounded())
    let height = Int((bounds.height * scale).rounded())
    guard let context = CGContext(
        data: nil,
        width: width,
        height: height,
        bitsPerComponent: 8,
        bytesPerRow: 0,
        space: CGColorSpaceCreateDeviceRGB(),
        bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue
    ) else { return nil }
    context.setFillColor(NSColor.white.cgColor)
    context.fill(CGRect(x: 0, y: 0, width: width, height: height))
    context.saveGState()
    context.scaleBy(x: scale, y: scale)
    page.draw(with: .mediaBox, to: context)
    context.restoreGState()
    return context.makeImage()
}

let encoder = JSONEncoder()
encoder.outputFormatting = [.withoutEscapingSlashes]

for path in CommandLine.arguments.dropFirst() {
    do {
        if path.lowercased().hasSuffix(".pdf") {
            guard let document = PDFDocument(url: URL(fileURLWithPath: path)) else {
                throw NSError(domain: "VisionOCR", code: 2, userInfo: [NSLocalizedDescriptionKey: "无法打开 PDF：\(path)"])
            }
            let start = max(1, Int(ProcessInfo.processInfo.environment["OCR_START"] ?? "1") ?? 1)
            let requestedEnd = Int(ProcessInfo.processInfo.environment["OCR_END"] ?? "") ?? document.pageCount
            let end = min(document.pageCount, requestedEnd)
            if start <= end {
                for pageNumber in start...end {
                    try autoreleasepool {
                        let targetWidth = CGFloat(Double(ProcessInfo.processInfo.environment["OCR_RENDER_WIDTH"] ?? "1500") ?? 1500)
                        guard let page = document.page(at: pageNumber - 1), let cgImage = pageImage(page, targetWidth: targetWidth) else {
                            throw NSError(domain: "VisionOCR", code: 3, userInfo: [NSLocalizedDescriptionKey: "无法渲染第 \(pageNumber) 页"])
                        }
                        let result = try recognize(cgImage, path: path, page: pageNumber)
                        FileHandle.standardOutput.write(try encoder.encode(result))
                        FileHandle.standardOutput.write(Data("\n".utf8))
                    }
                }
            }
        } else {
            let result = try recognizeImage(path)
            FileHandle.standardOutput.write(try encoder.encode(result))
            FileHandle.standardOutput.write(Data("\n".utf8))
        }
    } catch {
        FileHandle.standardError.write(Data("\(path): \(error.localizedDescription)\n".utf8))
        exit(1)
    }
}
