/**
 * Centralized Facebook DOM selectors and locators.
 *
 * DESIGN PRINCIPLE:
 * Prioritize semantic roles, accessible labels, and structural relations.
 * Do not scatter obfuscated class names across the codebase.
 */

export const RESHARE_SELECTORS = {
  /**
   * Potential clickable elements on the post footer representing reshare counts.
   * Uses semantic text matching for multiple locales (English, Vietnamese).
   */
  shareCountTriggers: [
    // Matches text like "12 shares", "1 share", "1,200 shares"
    '//div[contains(@role, "article") or contains(@role, "main")]//span[matches(text(), "^\\d[\\d,\\.]*\\s+(shares|share|lượt chia sẻ)$", "i")]',
    // Fallback: any link/button in the post area containing "share" or "lượt chia sẻ"
    '//span[contains(text(), " shares") or contains(text(), " lượt chia sẻ") or contains(text(), " share")]/ancestor::*[self::a or self::div[@role="button"]][1]',
    // Generic aria-label matches
    '[aria-label*="shares" i], [aria-label*="lượt chia sẻ" i]',
  ],

  /**
   * Reshares modal dialog container.
   */
  dialog: {
    roleDialog: '[role="dialog"]',
    // Common header labels on Facebook for the reshares modal
    headers: [
      '//div[@role="dialog"]//*[self::h1 or self::h2 or self::span][contains(text(), "People who shared this") or contains(text(), "Người đã chia sẻ")]',
    ],
    // Close button for the modal
    closeButton: '[role="dialog"] [aria-label="Close"], [role="dialog"] [aria-label="Đóng"]',
  },

  /**
   * Unauthenticated modal dismissals (login prompts, cookie banners)
   */
  dismissableOverlays: [
    // Cookie consent "Allow all cookies" or "Decline optional cookies"
    '[aria-label="Allow all cookies"], [aria-label="Cho phép tất cả cookie"]',
    '[aria-label="Decline optional cookies"], [aria-label="Từ chối các cookie không bắt buộc"]',
    // Login banner close buttons
    '[aria-label="Close"], [aria-label="Đóng"]',
  ],
};
