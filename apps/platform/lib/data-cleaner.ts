import { extractGovernorate } from "@/lib/address-validator";

/**
 * Enhanced phone number cleaner that standardizes numbers
 * specifically for the data import tool.
 */
export function cleanImportedPhone(phone: any): { clean: string; isValid: boolean } {
    if (!phone) return { clean: '', isValid: false };

    // Convert to string and ensure we trim whitespace
    let strPhone = String(phone).trim();

    // Remove all non-digit characters
    let cleaned = strPhone.replace(/\D/g, '');

    // If it starts with '964', remove it temporarily to standardized checking
    if (cleaned.startsWith('964')) {
        cleaned = cleaned.substring(3);
    }

    // Remove any leading zeros
    cleaned = cleaned.replace(/^0+/, '');

    // Most Iraqi mobile numbers (Zain, Asiacell, Korek) are 10 digits without leading 0 (e.g., 77xxxxxxxx)
    // Some might be landlines or different formats.
    const isValid = cleaned.length >= 10 && cleaned.startsWith('7');

    return { clean: cleaned, isValid };
}

export type ParsedAddress = {
    governorate_code: string;
    city: string;
    address_details: string;
    status: 'valid' | 'needs_review';
};

/**
 * Parses raw address text into structural components.
 * Uses the existing address-validator logic.
 */
export function parseRawAddress(rawAddress: any): ParsedAddress {
    if (!rawAddress || typeof rawAddress !== 'string') {
        return {
            governorate_code: '',
            city: '',
            address_details: '',
            status: 'needs_review'
        };
    }

    const text = rawAddress.trim();

    // Try to extract governorate from the text
    const extracted = extractGovernorate(text);

    if (extracted.governorate) {
        // Find the index of the district or governorate match to remove it from details
        let remainingDetails = text;
        const matchStr = (extracted as any).matched_district || extracted.governorate.nameEn || ''; // A simple heuristic, can be improved

        // Simple removal (case insensitive), this isn't perfect but helps clean it up
        if ((extracted as any).matched_district) {
            const regex = new RegExp((extracted as any).matched_district, 'i');
            remainingDetails = remainingDetails.replace(regex, '').trim();
        } else if (extracted.governorate.nameAr) {
            const regex = new RegExp(extracted.governorate.nameAr, 'g');
            remainingDetails = remainingDetails.replace(regex, '').trim();
        }

        // Clean up leading/trailing punctuation if left over
        remainingDetails = remainingDetails.replace(/^[,\\s-]+|[,\\s-]+$/g, '').trim();

        return {
            governorate_code: extracted.governorate.code,
            city: (extracted as any).matched_district || text, // Give sensible default if strict district matching failed
            address_details: remainingDetails || text,
            status: 'valid'
        };
    }

    return {
        governorate_code: '',
        city: text.length < 30 ? text : '', // If it's short, it might be a city
        address_details: text,
        status: 'needs_review'
    };
}

/**
 * Merges backup data into primary dataset based on a match criterion.
 */
export function mergeBackupIds(
    primaryData: any[],
    backupData: any[],
    matchFields: { primary: string; backup: string; target: string; backupTarget: string }
): { merged: any[]; matchCount: number } {
    let matchCount = 0;

    // Create an index of backup data for O(1) lookups
    const backupMap = new Map<string, string>();

    backupData.forEach(row => {
        const key = String(row[matchFields.backup] || '').trim().toLowerCase();
        const value = String(row[matchFields.backupTarget] || '').trim();
        if (key && value) {
            backupMap.set(key, value);
        }
    });

    const merged = primaryData.map(row => {
        const key = String(row[matchFields.primary] || '').trim().toLowerCase();
        const existingValue = row[matchFields.target];

        // Only merge if we don't already have it
        if (!existingValue && key && backupMap.has(key)) {
            matchCount++;
            return {
                ...row,
                [matchFields.target]: backupMap.get(key)
            };
        }
        return row;
    });

    return { merged, matchCount };
}
