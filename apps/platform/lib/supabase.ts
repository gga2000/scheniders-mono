import { createClient } from '@supabase/supabase-js';

// Supabase configuration
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
    console.warn('⚠️ Supabase environment variables are not set. Please configure them in .env.local');
}

// Create a single supabase client for the entire app
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Type definitions for our database tables
export interface Order {
    id: string;
    created_at: string;
    updated_at?: string;
    order_id: string;
    customer_name: string;
    phone: string;
    city?: string;
    governorate_code?: string;
    address_details?: string;
    items: OrderItem[];
    price: number;
    status: 'new' | 'contacted' | 'confirmed' | 'rejected' | 'delivered';
    whatsapp_link?: string;
    notes?: string;
    rejection_reason?: string;
}

export interface OrderItem {
    name: string;
    quantity: number;
    price: number;
}

export interface Blacklist {
    phone: string;
    reason: string;
    created_at: string;
    added_by?: string;
    notes?: string;
}
