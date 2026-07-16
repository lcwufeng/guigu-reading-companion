#!/usr/bin/env swift

import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

func loadImage(_ url: URL) -> (CGImage, [UInt8], Int, Int)? {
    guard
        let source = CGImageSourceCreateWithURL(url as CFURL, nil),
        let image = CGImageSourceCreateImageAtIndex(source, 0, nil)
    else { return nil }
    let width = image.width
    let height = image.height
    var pixels = [UInt8](repeating: 0, count: width * height * 4)
    guard let context = CGContext(
        data: &pixels,
        width: width,
        height: height,
        bitsPerComponent: 8,
        bytesPerRow: width * 4,
        space: CGColorSpaceCreateDeviceRGB(),
        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
    ) else { return nil }
    context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
    return (image, pixels, width, height)
}

func isBackground(_ pixels: [UInt8], _ index: Int) -> Bool {
    let offset = index * 4
    let red = Int(pixels[offset])
    let green = Int(pixels[offset + 1])
    let blue = Int(pixels[offset + 2])
    let brightest = max(red, green, blue)
    let darkest = min(red, green, blue)
    let average = (red + green + blue) / 3
    return brightest - darkest <= 20 && (average >= 188 || average <= 38)
}

func removeConnectedBackground(_ pixels: inout [UInt8], width: Int, height: Int) {
    var visited = [Bool](repeating: false, count: width * height)
    var queue = [Int]()
    queue.reserveCapacity(width * height / 2)

    func addSeed(_ index: Int) {
        guard !visited[index], isBackground(pixels, index) else { return }
        visited[index] = true
        queue.append(index)
    }

    for x in 0..<width {
        addSeed(x)
        addSeed((height - 1) * width + x)
    }
    for y in 0..<height {
        addSeed(y * width)
        addSeed(y * width + width - 1)
    }

    var cursor = 0
    while cursor < queue.count {
        let index = queue[cursor]
        cursor += 1
        let x = index % width
        let y = index / width
        if x > 0 { addSeed(index - 1) }
        if x + 1 < width { addSeed(index + 1) }
        if y > 0 { addSeed(index - width) }
        if y + 1 < height { addSeed(index + width) }
    }

    for index in queue {
        let offset = index * 4
        pixels[offset] = 0
        pixels[offset + 1] = 0
        pixels[offset + 2] = 0
        pixels[offset + 3] = 0
    }
}

func writePNG(_ pixels: inout [UInt8], width: Int, height: Int, to url: URL) -> Bool {
    guard let context = CGContext(
        data: &pixels,
        width: width,
        height: height,
        bitsPerComponent: 8,
        bytesPerRow: width * 4,
        space: CGColorSpaceCreateDeviceRGB(),
        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
    ), let image = context.makeImage(),
       let destination = CGImageDestinationCreateWithURL(url as CFURL, UTType.png.identifier as CFString, 1, nil)
    else { return false }
    CGImageDestinationAddImage(destination, image, nil)
    return CGImageDestinationFinalize(destination)
}

let paths = CommandLine.arguments.dropFirst()
guard !paths.isEmpty else {
    fputs("usage: remove_journal_background.swift image.png [...]\n", stderr)
    exit(2)
}

for path in paths {
    let url = URL(fileURLWithPath: path)
    guard let (_, originalPixels, width, height) = loadImage(url) else {
        fputs("unable to read \(path)\n", stderr)
        exit(1)
    }
    var pixels = originalPixels
    removeConnectedBackground(&pixels, width: width, height: height)
    guard writePNG(&pixels, width: width, height: height, to: url) else {
        fputs("unable to write \(path)\n", stderr)
        exit(1)
    }
    print("cleaned \(path)")
}
