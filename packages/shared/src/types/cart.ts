export interface CartItem {
  product_id: string;
  variant_id: string | null;
  name: string;
  variant_name: string | null;
  price: number;
  quantity: number;
  image_url: string | null;
}

export interface CheckoutFormData {
  customer_name: string;
  phone: string;
  governorate_code: string;
  city: string;
  address_details: string;
  notes?: string;
}
