/**
 * Centralized Facebook DOM selectors and locators.
 *
 * DESIGN PRINCIPLES:
 * 1. Accessibility & ARIA roles first.
 * 2. Semantic text matching (multilingual: English & Vietnamese).
 * 3. Scoped structural relationships.
 * 4. Never use giant obfuscated atomic CSS classes (.x1lliihq...) as primary locators.
 * 5. Strict differentiation between the Share COUNT trigger and the Share ACTION button.
 * 6. Explicit separation between POST container and RESHARE dialog container.
 */

export const RESHARE_SELECTORS = {
  /**
   * Unauthenticated Login Modal (Auth Gate) that appears when opening a public post logged-out.
   */
  authGate: {
    // Modal dialog demanding login
    modal: [
      'div[role="dialog"][aria-label*="Log In" i]',
      'div[role="dialog"][aria-label*="Đăng nhập" i]',
      'div[role="dialog"]:has(input[name="email"])',
      'div[role="dialog"]:has(form#login_popup_cta_form)',
      'div[role="dialog"]:has(div[aria-label*="See more on Facebook" i])',
      'div[role="dialog"]:has(div[aria-label*="Xem thêm trên Facebook" i])',
    ],
    // Close button for the login modal
    closeButton: [
      'div[role="dialog"][aria-label*="Log In" i] [aria-label="Close"]',
      'div[role="dialog"][aria-label*="Đăng nhập" i] [aria-label="Đóng"]',
      'div[role="dialog"]:has(input[name="email"]) [aria-label="Close"]',
      'div[role="dialog"]:has(input[name="email"]) [aria-label="Đóng"]',
      'div[role="dialog"]:has(input[name="email"]) div[role="button"][aria-label="Close"]',
      'div[role="dialog"]:has(input[name="email"]) div[role="button"][aria-label="Đóng"]',
      'div[aria-label*="See more on Facebook" i] [aria-label="Close"]',
      'div[aria-label*="Xem thêm trên Facebook" i] [aria-label="Đóng"]',
      '[aria-label="Close"], [aria-label="Đóng"]',
    ],
  },

  /**
   * Post Detail Container (Phase A).
   */
  postDetail: {
    // When post opens in a modal/dialog view
    dialogContainer: 'div[role="dialog"]:has(div[role="article"])',
    // Fallback main post container
    mainContainer: 'div[role="main"]',
    article: 'div[role="article"]',
  },

  /**
   * Selectors to detect and click the Share COUNT (which opens "People who shared this"),
   * explicitly avoiding the Share ACTION button (which opens composer to re-publish).
   */
  shareCountTriggers: [
    // 1. Text with number count + "share(s)" or "lượt chia sẻ" inside post area
    '//span[matches(normalize-space(text()), "^[0-9.,KkMb]+\\s*(shares?|lượt chia sẻ)$", "i")]/ancestor::*[self::a or self::div[@role="button"] or self::span][1]',

    // 2. Contains "shares" or "lượt chia sẻ" with leading count or whitespace, excluding plain "Share" action
    '//span[contains(translate(text(), "SHARES", "shares"), "shares") or contains(translate(text(), "LƯỢT CHIA SẺ", "lượt chia sẻ"), "lượt chia sẻ")][not(normalize-space(text())="Share") and not(normalize-space(text())="Chia sẻ")]/ancestor::*[self::a or self::div[@role="button"] or self::span][1]',

    // 3. Anchor or role="button" whose text contains share/lượt chia sẻ with a number
    '//a[matches(normalize-space(.), "[0-9]+\\s*(shares?|lượt chia sẻ)", "i")]',
    '//div[@role="button"][matches(normalize-space(.), "[0-9]+\\s*(shares?|lượt chia sẻ)", "i")]',

    // 4. Aria-label with count
    '[aria-label*="share" i]:not([aria-label="Share"]):not([aria-label="Chia sẻ"]):not([aria-label*="Send this" i])',
    '[aria-label*="lượt chia sẻ" i]:not([aria-label="Chia sẻ"])',
  ],

  /**
   * Reshares modal dialog container ("People who shared this") (Phase B).
   */
  reshareDialog: {
    // Primary dialog container for reshares list
    roleDialog: 'div[role="dialog"]',

    // Header labels confirming this is the reshares modal
    headers: [
      '//div[@role="dialog"]//*[self::h1 or self::h2 or self::span or self::div][contains(text(), "People who shared this") or contains(text(), "Người đã chia sẻ")]',
      'div[role="dialog"][aria-label*="People who shared this" i]',
      'div[role="dialog"][aria-label*="Người đã chia sẻ" i]',
    ],

    // Close button for the modal
    closeButton: '[role="dialog"] [aria-label="Close"], [role="dialog"] [aria-label="Đóng"]',
  },

  /**
   * Terminal error state indicators on post page.
   */
  pageErrors: {
    notFound: [
      '//span[contains(text(), "This content isn\'t available right now") or contains(text(), "Nội dung này hiện không khả dụng")]',
      '//div[contains(text(), "This page isn\'t available") or contains(text(), "Trang này không hiển thị")]',
      '//span[contains(text(), "Sorry, this content isn\'t available")]',
    ],
    blocked: [
      '//div[contains(text(), "We limit how often you can") or contains(text(), "Thử lại sau")]',
      '//div[contains(text(), "Security Check") or contains(text(), "Kiểm tra bảo mật")]',
    ],
  },

  /**
   * Unauthenticated cookie consent banners to dismiss.
   */
  cookieOverlays: [
    '[aria-label="Allow all cookies"], [aria-label="Cho phép tất cả cookie"]',
    '[aria-label="Decline optional cookies"], [aria-label="Từ chối các cookie không bắt buộc"]',
    'button:has-text("Allow all cookies")',
    'button:has-text("Decline optional cookies")',
    'button:has-text("Cho phép tất cả cookie")',
    'button:has-text("Từ chối")',
  ],
};
