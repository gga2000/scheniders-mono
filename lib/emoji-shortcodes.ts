/**
 * Emoji Shortcodes for WhatsApp Templates
 * 
 * Use shortcodes like {e:heart} in templates - they get converted to real emojis at send time.
 * Using Unicode code points to avoid encoding issues.
 */

// Emoji map - shortcode to Unicode code point(s)
// Using code points ensures correct encoding regardless of file encoding
const EMOJI_CODES: Record<string, number[]> = {
    // Greetings & Expressions
    'heart': [0x1F49B],           // 💛
    'heart_red': [0x2764, 0xFE0F], // ❤️
    'wave': [0x1F44B],            // 👋
    'smile': [0x1F60A],           // 😊
    'star': [0x2B50],             // ⭐
    'sparkles': [0x2728],         // ✨
    'fire': [0x1F525],            // 🔥
    'clap': [0x1F44F],            // 👏
    'pray': [0x1F64F],            // 🙏
    'thumbsup': [0x1F44D],        // 👍

    // Actions & Status
    'check': [0x2705],            // ✅
    'x': [0x1F6AB],               // 🚫
    'warning': [0x26A0, 0xFE0F],  // ⚠️
    'bell': [0x1F514],            // 🔔
    'clock': [0x23F0],            // ⏰
    'hourglass': [0x23F3],        // ⏳
    'target': [0x1F3AF],          // 🎯

    // Business & Shopping
    'gift': [0x1F381],            // 🎁
    'money': [0x1F4B5],           // 💵
    'tag': [0x1F3F7, 0xFE0F],     // 🏷️
    'cart': [0x1F6D2],            // 🛒
    'package': [0x1F4E6],         // 📦
    'truck': [0x1F69A],           // 🚚
    'rocket': [0x1F680],          // 🚀

    // Communication
    'phone': [0x1F4F1],           // 📱
    'call': [0x1F4DE],            // 📞
    'email': [0x1F4E7],           // 📧
    'chat': [0x1F4AC],            // 💬

    // Location & Info
    'pin': [0x1F4CD],             // 📍
    'house': [0x1F3E0],           // 🏠
    'globe': [0x1F30D],           // 🌍
    'book': [0x1F4D5],            // 📕
    'note': [0x1F4DD],            // 📝
    'person': [0x1F6B9],          // 🚹

    // Numbers & Symbols
    'one': [0x31, 0xFE0F, 0x20E3],     // 1️⃣
    'two': [0x32, 0xFE0F, 0x20E3],     // 2️⃣
    'three': [0x33, 0xFE0F, 0x20E3],   // 3️⃣
    'arrow_right': [0x27A1, 0xFE0F],   // ➡️
    'arrow_left': [0x2B05, 0xFE0F],    // ⬅️
    'point_right': [0x1F449],          // 👉
    'point_down': [0x1F447],           // 👇

    // Perfume specific
    'perfume': [0x1F338],         // 🌸
    'rose': [0x1F339],            // 🌹
    'diamond': [0x1F48E],         // 💎
    'crown': [0x1F451],           // 👑
};

// Build the actual emoji map from code points
export const EMOJI_MAP: Record<string, string> = {};
for (const [key, codePoints] of Object.entries(EMOJI_CODES)) {
    EMOJI_MAP[key] = String.fromCodePoint(...codePoints);
}

// Shortcode pattern: {e:name} or {emoji:name}
const SHORTCODE_PATTERN = /\{e(?:moji)?:([a-z_]+)\}/gi;

/**
 * Process a text string and replace all emoji shortcodes with actual emojis
 * @param text - Text containing shortcodes like {e:heart}
 * @returns Text with shortcodes replaced by actual emojis
 */
export function processEmojis(text: string): string {
    if (!text) return text;

    return text.replace(SHORTCODE_PATTERN, (match, shortcode) => {
        const emoji = EMOJI_MAP[shortcode.toLowerCase()];
        return emoji || match; // Return original if not found
    });
}

/**
 * Get list of all available emoji shortcodes for UI display
 */
export function getEmojiList(): Array<{ shortcode: string; emoji: string; category: string }> {
    const categories: Record<string, string[]> = {
        'Greetings': ['heart', 'heart_red', 'wave', 'smile', 'star', 'sparkles', 'fire', 'thumbsup'],
        'Status': ['check', 'x', 'warning', 'bell', 'clock', 'hourglass'],
        'Business': ['gift', 'money', 'tag', 'cart', 'package', 'truck', 'rocket'],
        'Contact': ['phone', 'call', 'email', 'chat', 'pin', 'person'],
    };

    const result: Array<{ shortcode: string; emoji: string; category: string }> = [];

    for (const [category, shortcodes] of Object.entries(categories)) {
        for (const shortcode of shortcodes) {
            if (EMOJI_MAP[shortcode]) {
                result.push({
                    shortcode,
                    emoji: EMOJI_MAP[shortcode],
                    category,
                });
            }
        }
    }

    return result;
}

/**
 * Convert actual emojis back to shortcodes (for editing)
 */
export function emojisToShortcodes(text: string): string {
    if (!text) return text;

    let result = text;
    for (const [shortcode, emoji] of Object.entries(EMOJI_MAP)) {
        result = result.replaceAll(emoji, `{e:${shortcode}}`);
    }
    return result;
}
