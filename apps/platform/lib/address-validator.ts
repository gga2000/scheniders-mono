/**
 * Iraqi Governorate Address Validation Engine
 * 
 * Validates customer addresses for Iraqi orders by:
 * 1. Recognizing the 19 Iraqi governorates (Arabic, English, Kurdish)
 * 2. Detecting incomplete addresses (governorate only, no area/landmark)
 * 3. Fuzzy matching for typo detection
 * 4. Learning from manual corrections
 */

// =============================================
// TYPES
// =============================================

export interface Governorate {
    code: string;       // Our standardized code (BGD, NAS, etc.)
    nameAr: string;     // Primary Arabic name
    nameEn: string;     // English name
    alternativeName?: string; // Well-known alternative Arabic name (e.g., الناصرية for ذي قار)
    aliases: string[];  // All variants: Arabic, English, Kurdish, common misspellings
}

export interface AddressValidation {
    isValid: boolean;
    governorate: Governorate | null;
    confidence: 'high' | 'medium' | 'low';
    issues: AddressIssue[];
    suggestedGovernorateCode?: string;
    originalInput: {
        city?: string;
        governorateCode?: string;
        addressDetails?: string;
    };
}

export type AddressIssue =
    | 'missing_governorate'      // ❌ Can't identify any governorate
    | 'incomplete_address'       // ⚠️ Only governorate name, no area/details
    | 'possible_typo';           // 🔍 Found fuzzy match, flag for review

export type AddressStatus = 'valid' | 'incomplete' | 'invalid' | 'needs_review';

// =============================================
// GOVERNORATE DATABASE - 19 Iraqi Governorates
// =============================================

export const GOVERNORATES: Governorate[] = [
    {
        code: 'BGD',
        nameAr: 'بغداد',
        nameEn: 'Baghdad',
        aliases: [
            'بغداد', 'البغداد', 'بغدان', 'بقداد', 'بغذاد',
            'baghdad', 'bagdad', 'bgd', 'بەغدا'
        ]
    },
    {
        code: 'NAS',
        nameAr: 'ذي قار',
        nameEn: 'Dhi Qar',
        alternativeName: 'الناصرية',
        aliases: [
            'ذي قار', 'ذيقار', 'الناصرية', 'ناصرية', 'الناصريه', 'ناصريه',
            'nasiriyah', 'nasiriya', 'dhi qar', 'dhiqar', 'thi qar'
        ]
    },
    {
        code: 'DYL',
        nameAr: 'ديالى',
        nameEn: 'Diyala',
        alternativeName: 'بعقوبة',
        aliases: [
            'ديالى', 'ديالا', 'دياله', 'بعقوبة', 'بعقوبه',
            'diyala', 'diyalah', 'baqubah', 'baquba'
        ]
    },
    {
        code: 'KOT',
        nameAr: 'واسط',
        nameEn: 'Wasit',
        alternativeName: 'الكوت',
        aliases: [
            'واسط', 'كوت', 'الكوت', 'الكوت واسط',
            'wasit', 'kut', 'koot', 'al-kut'
        ]
    },
    {
        code: 'KRB',
        nameAr: 'كربلاء',
        nameEn: 'Karbala',
        aliases: [
            'كربلاء', 'كربلا', 'كربله', 'كربلة',
            'karbala', 'kerbala', 'kerbela', 'karbalaa'
        ]
    },
    {
        code: 'DOH',
        nameAr: 'دهوك',
        nameEn: 'Duhok',
        aliases: [
            'دهوك', 'دهوک', 'داهوك', 'دحوك',
            'duhok', 'dahuk', 'dohuk', 'دەھۆک'
        ]
    },
    {
        code: 'BBL',
        nameAr: 'بابل',
        nameEn: 'Babylon',
        alternativeName: 'الحلة',
        aliases: [
            'بابل', 'الحلة', 'حلة', 'الحله', 'حله', 'بابل الحلة',
            'babylon', 'babel', 'hilla', 'hillah', 'al-hilla'
        ]
    },
    {
        code: 'NJF',
        nameAr: 'النجف',
        nameEn: 'Najaf',
        aliases: [
            'النجف', 'نجف', 'الكوفة', 'كوفة', 'الكوفه',
            'najaf', 'al-najaf', 'kufa', 'kufah'
        ]
    },
    {
        code: 'BAS',
        nameAr: 'البصرة',
        nameEn: 'Basra',
        aliases: [
            'البصرة', 'بصرة', 'البصره', 'بصره',
            'basra', 'basrah', 'al-basra', 'بەسرە'
        ]
    },
    {
        code: 'ARB',
        nameAr: 'أربيل',
        nameEn: 'Erbil',
        aliases: [
            'أربيل', 'اربيل', 'أربيل', 'إربيل', 'هەولێر', 'هولير', 'هاولير',
            'erbil', 'irbil', 'arbil', 'hawler', 'hewler'
        ]
    },
    {
        code: 'KRK',
        nameAr: 'كركوك',
        nameEn: 'Kirkuk',
        aliases: [
            'كركوك', 'کرکوک', 'كركك',
            'kirkuk', 'kerkuk', 'کەرکووک'
        ]
    },
    {
        code: 'SAM',
        nameAr: 'المثنى',
        nameEn: 'Muthanna',
        alternativeName: 'السماوة',
        aliases: [
            'المثنى', 'مثنى', 'السماوة', 'سماوة', 'السماوه', 'سماوه',
            'muthanna', 'al-muthanna', 'samawah', 'samawa'
        ]
    },
    {
        code: 'SAH',
        nameAr: 'صلاح الدين',
        nameEn: 'Saladin',
        alternativeName: 'تكريت',
        aliases: [
            'صلاح الدين', 'صلاحالدين', 'تكريت', 'تكريت صلاح الدين',
            'saladin', 'salahaddin', 'salah al-din', 'tikrit', 'tikreet'
        ]
    },
    {
        code: 'ANB',
        nameAr: 'الأنبار',
        nameEn: 'Anbar',
        alternativeName: 'الرمادي',
        aliases: [
            'الأنبار', 'الانبار', 'أنبار', 'انبار', 'الرمادي', 'رمادي', 'الرماديه',
            'الفلوجة', 'فلوجة', 'الفلوجه',
            'anbar', 'al-anbar', 'ramadi', 'fallujah', 'falluja'
        ]
    },
    {
        code: 'SMH',
        nameAr: 'السليمانية',
        nameEn: 'Sulaymaniyah',
        aliases: [
            'السليمانية', 'سليمانية', 'السليمانيه', 'سليمانيه',
            'سلێمانی', 'سليماني',
            'sulaymaniyah', 'suleimaniya', 'slemani', 'slêmanî',
            'حلبجة', 'حلبجه', 'halabja', 'halabjah'
        ]
    },
    {
        code: 'MOS',
        nameAr: 'نينوى',
        nameEn: 'Nineveh',
        alternativeName: 'الموصل',
        aliases: [
            'نينوى', 'نينوا', 'موصل', 'الموصل', 'الموصول',
            'nineveh', 'ninawa', 'mosul', 'al-mosul', 'mûsil'
        ]
    },
    {
        code: 'DWN',
        nameAr: 'القادسية',
        nameEn: 'Qadisiyah',
        alternativeName: 'الديوانية',
        aliases: [
            'القادسية', 'قادسية', 'الديوانية', 'ديوانية', 'الديوانيه', 'ديوانيه',
            'qadisiyah', 'qadisiyyah', 'diwaniyah', 'diwaniya', 'al-diwaniyah'
        ]
    },
    {
        code: 'AMA',
        nameAr: 'ميسان',
        nameEn: 'Maysan',
        alternativeName: 'العمارة',
        aliases: [
            'ميسان', 'عمارة', 'العمارة', 'العماره', 'عماره', 'عمارة ميسان',
            'maysan', 'amara', 'amarah', 'al-amarah'
        ]
    }
];

// =============================================
// TEXT NORMALIZATION
// =============================================

/**
 * Normalize Arabic text for comparison
 * - Removes diacritics (تشكيل)
 * - Normalizes similar characters (ی/ي, ک/ك, ە/ه)
 * - Trims and lowercases
 */
export function normalizeArabicText(text: string): string {
    if (!text) return '';

    return text
        // Remove Arabic diacritics (تشكيل)
        .replace(/[\u064B-\u065F\u0670]/g, '')
        // Normalize ی to ي
        .replace(/ی/g, 'ي')
        // Normalize ک to ك
        .replace(/ک/g, 'ك')
        // Normalize ە to ه
        .replace(/ە/g, 'ه')
        // Normalize أإآ to ا
        .replace(/[أإآ]/g, 'ا')
        // Normalize ة to ه
        .replace(/ة/g, 'ه')
        // Remove extra whitespace
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
}

// =============================================
// FUZZY MATCHING (Levenshtein Distance)
// =============================================

/**
 * Calculate Levenshtein distance between two strings
 */
export function levenshteinDistance(a: string, b: string): number {
    const matrix: number[][] = [];

    for (let i = 0; i <= b.length; i++) {
        matrix[i] = [i];
    }

    for (let j = 0; j <= a.length; j++) {
        matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1, // substitution
                    matrix[i][j - 1] + 1,     // insertion
                    matrix[i - 1][j] + 1      // deletion
                );
            }
        }
    }

    return matrix[b.length][a.length];
}

/**
 * Find closest governorate match using fuzzy matching
 */
export function findFuzzyMatch(input: string): { governorate: Governorate; distance: number } | null {
    const normalizedInput = normalizeArabicText(input);

    if (!normalizedInput || normalizedInput.length < 2) {
        return null;
    }

    let bestMatch: { governorate: Governorate; distance: number } | null = null;

    for (const gov of GOVERNORATES) {
        for (const alias of gov.aliases) {
            const normalizedAlias = normalizeArabicText(alias);
            const distance = levenshteinDistance(normalizedInput, normalizedAlias);

            // Only consider matches within 2 character distance
            // And the distance should be less than half the input length (avoid false positives)
            if (distance <= 2 && distance < normalizedInput.length / 2) {
                if (!bestMatch || distance < bestMatch.distance) {
                    bestMatch = { governorate: gov, distance };
                }
            }
        }
    }

    return bestMatch;
}

// =============================================
// GOVERNORATE LOOKUP
// =============================================

/**
 * Find exact governorate match from input text
 */
export function findExactGovernorate(input: string): Governorate | null {
    if (!input) return null;

    const normalizedInput = normalizeArabicText(input);

    for (const gov of GOVERNORATES) {
        // Check exact match with aliases
        for (const alias of gov.aliases) {
            if (normalizeArabicText(alias) === normalizedInput) {
                return gov;
            }
        }

        // Check if input CONTAINS the governorate name
        for (const alias of gov.aliases) {
            const normalizedAlias = normalizeArabicText(alias);
            if (normalizedAlias.length >= 3 && normalizedInput.includes(normalizedAlias)) {
                return gov;
            }
        }
    }

    return null;
}

/**
 * Extract governorate from an address string and return the remaining address
 * 
 * Example: "النجف حي الامير مقابل قاعه عشتار" 
 * Returns: { governorate: Najaf, city: "النجف", remainingAddress: "حي الامير مقابل قاعه عشتار" }
 */
export function extractAndSeparateGovernorate(fullAddress: string): {
    governorate: Governorate | null;
    city: string;
    remainingAddress: string;
} {
    if (!fullAddress || !fullAddress.trim()) {
        return { governorate: null, city: '', remainingAddress: '' };
    }

    const trimmedAddress = fullAddress.trim();

    // Try to find a governorate in the address
    for (const gov of GOVERNORATES) {
        for (const alias of gov.aliases) {
            // Check if the address STARTS with this governorate name (case insensitive)
            const normalizedAlias = normalizeArabicText(alias);
            const normalizedAddress = normalizeArabicText(trimmedAddress);

            if (normalizedAddress.startsWith(normalizedAlias)) {
                // Find where the alias appears in the original text (preserving case)
                // Look for separators after the governorate: space, dash, comma
                const aliasLength = alias.length;

                // Find the governorate portion in original text
                let foundIndex = -1;
                for (let i = 0; i <= trimmedAddress.length - aliasLength; i++) {
                    const substr = trimmedAddress.substring(i, i + aliasLength);
                    if (normalizeArabicText(substr) === normalizedAlias) {
                        foundIndex = i;
                        break;
                    }
                }

                if (foundIndex !== -1) {
                    const matchedPortion = trimmedAddress.substring(foundIndex, foundIndex + aliasLength);
                    const afterMatch = trimmedAddress.substring(foundIndex + aliasLength).trim();

                    // Remove leading separators from remaining address
                    const cleanedRemaining = afterMatch.replace(/^[\s\-،,\/:]+/, '').trim();

                    return {
                        governorate: gov,
                        city: matchedPortion,
                        remainingAddress: cleanedRemaining
                    };
                }
            }

            // Also check if the governorate appears after a separator
            // e.g., "حي الامير - النجف" (less common but possible)
            if (normalizedAddress.includes(normalizedAlias)) {
                // Find where it appears
                const startIdx = normalizedAddress.indexOf(normalizedAlias);

                // Build the parts
                const beforeGov = trimmedAddress.substring(0, startIdx).replace(/[\s\-،,\/:]+$/, '').trim();
                const afterGov = trimmedAddress.substring(startIdx + alias.length).replace(/^[\s\-،,\/:]+/, '').trim();

                // Combine before and after as the remaining address
                const remaining = [beforeGov, afterGov].filter(Boolean).join(' ');

                return {
                    governorate: gov,
                    city: gov.nameAr, // Use the standard Arabic name
                    remainingAddress: remaining
                };
            }
        }
    }

    // No governorate found - return the full address as remainingAddress
    return {
        governorate: null,
        city: '',
        remainingAddress: trimmedAddress
    };
}

/**
 * Extract governorate from address text (city, governorate_code, or address_details)
 */
export function extractGovernorate(
    city?: string,
    governorateCode?: string,
    addressDetails?: string
): { governorate: Governorate | null; confidence: 'high' | 'medium' | 'low'; source: string } {

    // 1. First try the governorate_code field (should be most reliable)
    if (governorateCode) {
        const normalizedCode = governorateCode.toUpperCase().trim();
        const govByCode = GOVERNORATES.find(g => g.code === normalizedCode);
        if (govByCode) {
            return { governorate: govByCode, confidence: 'high', source: 'governorate_code' };
        }
        // Also try matching code as alias
        const govByCodeAlias = findExactGovernorate(governorateCode);
        if (govByCodeAlias) {
            return { governorate: govByCodeAlias, confidence: 'high', source: 'governorate_code' };
        }
    }

    // 2. Try the city field
    if (city) {
        const govFromCity = findExactGovernorate(city);
        if (govFromCity) {
            return { governorate: govFromCity, confidence: 'high', source: 'city' };
        }

        // Try fuzzy match
        const fuzzyMatch = findFuzzyMatch(city);
        if (fuzzyMatch) {
            if (fuzzyMatch.distance === 0) {
                return { governorate: fuzzyMatch.governorate, confidence: 'high', source: 'city' };
            } else if (fuzzyMatch.distance === 1) {
                return { governorate: fuzzyMatch.governorate, confidence: 'medium', source: 'city_fuzzy' };
            } else {
                return { governorate: fuzzyMatch.governorate, confidence: 'low', source: 'city_fuzzy' };
            }
        }
    }

    // 3. Try address_details as last resort
    if (addressDetails) {
        const govFromAddress = findExactGovernorate(addressDetails);
        if (govFromAddress) {
            return { governorate: govFromAddress, confidence: 'medium', source: 'address_details' };
        }
    }

    return { governorate: null, confidence: 'low', source: 'none' };
}

// =============================================
// ADDRESS COMPLETENESS CHECK
// =============================================

/**
 * Check if address is complete (has area/details, not just governorate)
 * 
 * SIMPLE RULE: Only flag as incomplete if address_details is EMPTY
 * 
 * Complete examples:
 * - Any city + address_details has content ✅
 * - "بغداد - المنصور" in city field (has area) ✅
 * 
 * Incomplete example:
 * - City = "بغداد" AND address_details is empty ❌
 */
export function isAddressComplete(
    city?: string,
    addressDetails?: string,
    matchedGovernorate?: Governorate
): boolean {
    // If we have address_details with any content, it's complete
    if (addressDetails && addressDetails.trim().length > 0) {
        return true;
    }

    // If city field has content beyond just the governorate name, it's complete
    // Check if city contains separators or is longer than just the governorate
    if (city && city.trim().length > 0) {
        const hasSeparators = /[-،,\/]/.test(city);
        if (hasSeparators) {
            return true; // Has multiple parts like "بغداد - المنصور"
        }

        // If we matched a governorate, check if city is JUST that governorate
        if (matchedGovernorate) {
            const normalizedCity = normalizeArabicText(city);
            // Check if city is exactly one of the governorate aliases
            for (const alias of matchedGovernorate.aliases) {
                if (normalizeArabicText(alias) === normalizedCity) {
                    // City is JUST the governorate name with NO address_details = incomplete
                    return false;
                }
            }
            // City has more content than just the governorate name
            return true;
        }

        // No governorate matched but city has content - assume complete
        return true;
    }

    // No city and no address_details = incomplete
    return false;
}

// =============================================
// MAIN VALIDATION FUNCTION
// =============================================

/**
 * Validate a customer address and return detailed validation result
 */
export function validateAddress(
    city?: string,
    governorateCode?: string,
    addressDetails?: string
): AddressValidation {
    const issues: AddressIssue[] = [];

    // Extract governorate
    const { governorate, confidence, source } = extractGovernorate(city, governorateCode, addressDetails);

    // Check for missing governorate
    if (!governorate) {
        issues.push('missing_governorate');
        return {
            isValid: false,
            governorate: null,
            confidence: 'low',
            issues,
            originalInput: { city, governorateCode, addressDetails }
        };
    }

    // Check for fuzzy match (possible typo)
    if (source.includes('fuzzy') && confidence !== 'high') {
        issues.push('possible_typo');
    }

    // Check address completeness
    const isComplete = isAddressComplete(city, addressDetails, governorate);
    if (!isComplete) {
        issues.push('incomplete_address');
    }

    // Determine if valid
    const isValid = issues.length === 0;

    return {
        isValid,
        governorate,
        confidence,
        issues,
        suggestedGovernorateCode: governorate.code,
        originalInput: { city, governorateCode, addressDetails }
    };
}

/**
 * Get address status from validation result
 */
export function getAddressStatus(validation: AddressValidation): AddressStatus {
    if (validation.isValid) {
        return 'valid';
    }

    if (validation.issues.includes('missing_governorate')) {
        return 'invalid';
    }

    if (validation.issues.includes('incomplete_address')) {
        return 'incomplete';
    }

    if (validation.issues.includes('possible_typo')) {
        return 'needs_review';
    }

    return 'needs_review';
}

/**
 * Get all governorate codes for dropdown
 */
export function getAllGovernorateCodes(): Array<{ code: string; nameAr: string; nameEn: string; alternativeName?: string }> {
    // Deduplicate by code
    const seen = new Set<string>();
    return GOVERNORATES
        .filter(g => {
            if (seen.has(g.code)) return false;
            seen.add(g.code);
            return true;
        })
        .map(g => ({
            code: g.code,
            nameAr: g.nameAr,
            nameEn: g.nameEn,
            alternativeName: g.alternativeName
        }));
}

/**
 * The one governorate <option> list for order forms (new-order and edit-order modals):
 * value is the Arabic name stored in `orders.city`, label is numbered with the capital
 * in parentheses — "2. ذي قار (الناصرية)". Both modals render this so they can't drift.
 */
export function getGovernorateSelectOptions(): Array<{ code: string; value: string; label: string }> {
    return getAllGovernorateCodes().map((gov, index) => ({
        code: gov.code,
        value: gov.nameAr,
        label: `${index + 1}. ${gov.nameAr}${gov.alternativeName ? ` (${gov.alternativeName})` : ''}`,
    }));
}

/**
 * Get governorate by code
 */
export function getGovernorateByCode(code: string): Governorate | undefined {
    return GOVERNORATES.find(g => g.code === code.toUpperCase());
}
