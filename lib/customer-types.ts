

// Tag color type matching database enum
export type TagColor = 'yellow' | 'green' | 'blue' | 'pink' | 'purple' | 'orange' | 'red' | 'gray';

// Customer status type
export type CustomerStatus = 'new' | 'regular' | 'vip';

// Customer Tag interface
export interface CustomerTag {
    id: string;
    name: string;
    color: TagColor;
    created_at: string;
}

// Customer Note interface
export interface CustomerNote {
    id: string;
    customer_phone: string;
    note: string;
    created_at: string;
    updated_at?: string;
}

// Customer Metadata interface
export interface CustomerMetadata {
    customer_phone: string;
    birthday?: string;
    manual_status?: CustomerStatus;
    created_at: string;
    updated_at?: string;
}

// Customer Tag Assignment interface
export interface CustomerTagAssignment {
    id: string;
    customer_phone: string;
    tag_id: string;
    created_at: string;
    tag?: CustomerTag;
}

// Tag color mappings for UI
export const tagColorClasses: Record<TagColor, { bg: string; text: string }> = {
    yellow: { bg: 'bg-amber-100', text: 'text-amber-800' },
    green: { bg: 'bg-green-100', text: 'text-green-800' },
    blue: { bg: 'bg-blue-100', text: 'text-blue-800' },
    pink: { bg: 'bg-pink-100', text: 'text-pink-800' },
    purple: { bg: 'bg-purple-100', text: 'text-purple-800' },
    orange: { bg: 'bg-orange-100', text: 'text-orange-800' },
    red: { bg: 'bg-red-100', text: 'text-red-800' },
    gray: { bg: 'bg-gray-100', text: 'text-gray-800' },
};
