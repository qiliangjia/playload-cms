import { describe, it, expect } from 'vitest'

// The endpoint body is module-scoped inside the handler; extract the regex here
// to keep test coverage against the same rule.
const RELATIVE_IMAGE_PATTERN = /!\[[^\]]*]\((?!https?:\/\/|data:)[^)]+\)/

describe('cmsMcpFromMarkdown relative-image guard', () => {
  it('flags relative paths', () => {
    expect(RELATIVE_IMAGE_PATTERN.test('![alt](./local/path.png)')).toBe(true)
    expect(RELATIVE_IMAGE_PATTERN.test('before ![alt](../foo.jpg) after')).toBe(true)
    expect(RELATIVE_IMAGE_PATTERN.test('![alt](media/a.png)')).toBe(true)
  })
  it('passes absolute http(s) and data URLs', () => {
    expect(RELATIVE_IMAGE_PATTERN.test('![alt](https://cms-r2.deepclick.com/media/a.png)')).toBe(
      false,
    )
    expect(RELATIVE_IMAGE_PATTERN.test('![alt](http://example.com/a.png)')).toBe(false)
    expect(RELATIVE_IMAGE_PATTERN.test('![alt](data:image/png;base64,AAA)')).toBe(false)
  })
  it('ignores non-image links', () => {
    expect(RELATIVE_IMAGE_PATTERN.test('[text](./foo.md)')).toBe(false)
  })
})
