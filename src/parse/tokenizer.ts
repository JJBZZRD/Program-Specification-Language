const TOKEN_PATTERN = /(\d+\.\d+|\d+|[A-Za-z]+|[@xX%\-])/g;

export function tokenizeShorthand(input: string): string[] {
  return input.match(TOKEN_PATTERN) ?? [];
}
