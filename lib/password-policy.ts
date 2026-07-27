const COMMON_PASSWORDS = new Set([
  "123456",
  "12345678",
  "password",
  "qwerty123",
  "11111111",
  "88888888",
  "abc12345",
]);

export function studentPasswordError(password: string) {
  if (password.length < 8 || password.length > 64) return "新密码需要设置为 8～64 位。";
  if (COMMON_PASSWORDS.has(password.toLowerCase())) return "这个密码太容易被猜到，请换一个更特别的密码。";
  const kinds = [
    /[A-Za-z]/.test(password),
    /\d/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ].filter(Boolean).length;
  if (kinds < 2) return "请混合使用字母、数字或符号中的至少两种。";
  return "";
}
