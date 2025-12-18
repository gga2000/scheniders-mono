"use client";

import { useMemo, useState, useCallback, useEffect } from "react";
import { useOrders } from "./use-orders";
import { Order } from "@/lib/supabase";
import { supabase } from "@/lib/supabase";
import { CustomerTag, CustomerTagAssignment, CustomerMetadata, CustomerStatus } from "@/lib/customer-types";

export interface Customer {
    id: string;
    name: string;
    phone: string;
    city?: string;
    governorate?: string;
    totalOrders: number;
    totalSpent: number;
    lastOrderDate: string;
    firstOrderDate: string;
    orders: Order[];
    status: CustomerStatus;
    favoriteProducts: { name: string; count: number }[];
    tags?: CustomerTag[];
    metadata?: CustomerMetadata;
    isBlacklisted?: boolean;
}

export interface CustomerFilters {
    status?: CustomerStatus | "all";
    city?: string;
    dateRange?: { start: string; end: string };
    minSpend?: number;
    maxSpend?: number;
    productName?: string;
    search?: string;
    sortBy?: "name" | "orders" | "spent" | "lastOrder";
    sortOrder?: "asc" | "desc";
}

export interface GeoDistribution {
    city: string;
    count: number;
    revenue: number;
}

export interface CustomerGrowth {
    date: string;
    newCustomers: number;
    totalCustomers: number;
}

export function useCustomers(filters?: CustomerFilters) {
    const { orders, loading: ordersLoading, error } = useOrders();
    const [tagAssignments, setTagAssignments] = useState<Map<string, CustomerTag[]>>(new Map());
    const [metadataMap, setMetadataMap] = useState<Map<string, CustomerMetadata>>(new Map());
    const [blacklist, setBlacklist] = useState<Set<string>>(new Set());
    const [dataLoading, setDataLoading] = useState(true);

    // Fetch all customer data
    const fetchCustomerData = useCallback(async () => {
        try {
            setDataLoading(true);

            // Fetch tag assignments with tags
            const { data: assignments } = await supabase
                .from("customer_tag_assignments")
                .select(`*, tag:customer_tags(*)`);

            if (assignments) {
                const map = new Map<string, CustomerTag[]>();
                assignments.forEach((a: CustomerTagAssignment & { tag: CustomerTag }) => {
                    const existing = map.get(a.customer_phone) || [];
                    if (a.tag) existing.push(a.tag);
                    map.set(a.customer_phone, existing);
                });
                setTagAssignments(map);
            }

            // Fetch metadata
            const { data: metadata } = await supabase
                .from("customer_metadata")
                .select("*");

            if (metadata) {
                const map = new Map<string, CustomerMetadata>();
                metadata.forEach((m: CustomerMetadata) => {
                    map.set(m.customer_phone, m);
                });
                setMetadataMap(map);
            }

            // Fetch blacklist
            const { data: blacklistData } = await supabase
                .from("blacklist")
                .select("phone");

            if (blacklistData) {
                setBlacklist(new Set(blacklistData.map((b: { phone: string }) => b.phone)));
            }
        } catch (err) {
            console.error("Error fetching customer data:", err);
        } finally {
            setDataLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchCustomerData();
    }, [fetchCustomerData]);

    // Build customer list from orders
    const customers = useMemo(() => {
        const customerMap = new Map<string, Customer>();

        orders.forEach((order) => {
            const phone = order.phone;

            if (customerMap.has(phone)) {
                const existing = customerMap.get(phone)!;
                existing.totalOrders += 1;
                existing.totalSpent += Number(order.price) || 0;
                existing.orders.push(order);

                // Update last/first order dates
                const orderDate = new Date(order.created_at);
                if (orderDate > new Date(existing.lastOrderDate)) {
                    existing.lastOrderDate = order.created_at;
                }
                if (orderDate < new Date(existing.firstOrderDate)) {
                    existing.firstOrderDate = order.created_at;
                }

                // Track products
                if (order.items) {
                    order.items.forEach((item) => {
                        const existingProduct = existing.favoriteProducts.find(
                            (p) => p.name.toLowerCase() === item.name.toLowerCase()
                        );
                        if (existingProduct) {
                            existingProduct.count += item.quantity;
                        } else {
                            existing.favoriteProducts.push({ name: item.name, count: item.quantity });
                        }
                    });
                }
            } else {
                const favoriteProducts: { name: string; count: number }[] = [];
                if (order.items) {
                    order.items.forEach((item) => {
                        favoriteProducts.push({ name: item.name, count: item.quantity });
                    });
                }

                customerMap.set(phone, {
                    id: phone,
                    name: order.customer_name,
                    phone: order.phone,
                    city: order.city,
                    governorate: order.governorate_code,
                    totalOrders: 1,
                    totalSpent: Number(order.price) || 0,
                    lastOrderDate: order.created_at,
                    firstOrderDate: order.created_at,
                    orders: [order],
                    status: "new",
                    favoriteProducts,
                });
            }
        });

        // Enhance customers with metadata, tags, blacklist status
        customerMap.forEach((customer) => {
            // Sort favorite products
            customer.favoriteProducts.sort((a, b) => b.count - a.count);

            // Determine status (manual override takes precedence)
            const meta = metadataMap.get(customer.phone);
            if (meta?.manual_status) {
                customer.status = meta.manual_status;
            } else if (customer.totalOrders >= 5 || customer.totalSpent >= 500000) {
                customer.status = "vip";
            } else if (customer.totalOrders >= 2) {
                customer.status = "regular";
            }

            // Add tags
            customer.tags = tagAssignments.get(customer.phone) || [];

            // Add metadata
            customer.metadata = meta;

            // Check blacklist
            customer.isBlacklisted = blacklist.has(customer.phone);
        });

        return Array.from(customerMap.values());
    }, [orders, tagAssignments, metadataMap, blacklist]);

    // Apply filters
    const filteredCustomers = useMemo(() => {
        let result = [...customers];

        if (filters?.status && filters.status !== "all") {
            result = result.filter((c) => c.status === filters.status);
        }

        if (filters?.city) {
            result = result.filter((c) => c.city?.toLowerCase().includes(filters.city!.toLowerCase()));
        }

        if (filters?.dateRange) {
            result = result.filter((c) => {
                const lastOrder = new Date(c.lastOrderDate);
                const start = new Date(filters.dateRange!.start);
                const end = new Date(filters.dateRange!.end);
                return lastOrder >= start && lastOrder <= end;
            });
        }

        if (filters?.minSpend !== undefined) {
            result = result.filter((c) => c.totalSpent >= filters.minSpend!);
        }

        if (filters?.maxSpend !== undefined) {
            result = result.filter((c) => c.totalSpent <= filters.maxSpend!);
        }

        if (filters?.productName) {
            result = result.filter((c) =>
                c.favoriteProducts.some((p) =>
                    p.name.toLowerCase().includes(filters.productName!.toLowerCase())
                )
            );
        }

        if (filters?.search) {
            const search = filters.search.toLowerCase();
            result = result.filter(
                (c) =>
                    c.name.toLowerCase().includes(search) ||
                    c.phone.includes(search) ||
                    c.city?.toLowerCase().includes(search)
            );
        }

        // Sorting
        const sortBy = filters?.sortBy || "lastOrder";
        const sortOrder = filters?.sortOrder || "desc";

        result.sort((a, b) => {
            let comparison = 0;
            switch (sortBy) {
                case "name":
                    comparison = a.name.localeCompare(b.name);
                    break;
                case "orders":
                    comparison = a.totalOrders - b.totalOrders;
                    break;
                case "spent":
                    comparison = a.totalSpent - b.totalSpent;
                    break;
                case "lastOrder":
                default:
                    comparison = new Date(a.lastOrderDate).getTime() - new Date(b.lastOrderDate).getTime();
            }
            return sortOrder === "desc" ? -comparison : comparison;
        });

        return result;
    }, [customers, filters]);

    // Statistics
    const stats = useMemo(() => {
        const total = customers.length;
        const newCustomers = customers.filter((c) => c.status === "new").length;
        const regularCustomers = customers.filter((c) => c.status === "regular").length;
        const vipCustomers = customers.filter((c) => c.status === "vip").length;
        const totalRevenue = customers.reduce((sum, c) => sum + c.totalSpent, 0);
        const repeatCustomers = customers.filter((c) => c.totalOrders >= 2).length;
        const retentionRate = total > 0 ? (repeatCustomers / total) * 100 : 0;

        return {
            total,
            newCustomers,
            regularCustomers,
            vipCustomers,
            totalRevenue,
            averageOrderValue: orders.length > 0 ? totalRevenue / orders.length : 0,
            repeatCustomers,
            retentionRate,
        };
    }, [customers, orders]);

    // Geographic distribution
    const geoDistribution = useMemo((): GeoDistribution[] => {
        const cityMap = new Map<string, { count: number; revenue: number }>();

        customers.forEach((customer) => {
            const city = customer.city || "Unknown";
            const existing = cityMap.get(city) || { count: 0, revenue: 0 };
            existing.count += 1;
            existing.revenue += customer.totalSpent;
            cityMap.set(city, existing);
        });

        return Array.from(cityMap.entries())
            .map(([city, data]) => ({ city, ...data }))
            .sort((a, b) => b.count - a.count);
    }, [customers]);

    // Top spenders
    const topSpenders = useMemo(() => {
        return [...customers].sort((a, b) => b.totalSpent - a.totalSpent).slice(0, 10);
    }, [customers]);

    // Customer growth over time
    const customerGrowth = useMemo((): CustomerGrowth[] => {
        const dateMap = new Map<string, Set<string>>();
        const allCustomers = new Set<string>();

        // Group first orders by date
        customers.forEach((customer) => {
            const date = customer.firstOrderDate.split("T")[0];
            if (!dateMap.has(date)) {
                dateMap.set(date, new Set());
            }
            dateMap.get(date)!.add(customer.phone);
        });

        // Sort dates and calculate cumulative
        const sortedDates = Array.from(dateMap.keys()).sort();
        const result: CustomerGrowth[] = [];

        sortedDates.forEach((date) => {
            const newPhones = dateMap.get(date)!;
            newPhones.forEach((p) => allCustomers.add(p));
            result.push({
                date,
                newCustomers: newPhones.size,
                totalCustomers: allCustomers.size,
            });
        });

        return result;
    }, [customers]);

    // Unique cities for filter dropdown
    const uniqueCities = useMemo(() => {
        const cities = new Set<string>();
        customers.forEach((c) => {
            if (c.city) cities.add(c.city);
        });
        return Array.from(cities).sort();
    }, [customers]);

    // Unique products for filter dropdown
    const uniqueProducts = useMemo(() => {
        const products = new Set<string>();
        customers.forEach((c) => {
            c.favoriteProducts.forEach((p) => products.add(p.name));
        });
        return Array.from(products).sort();
    }, [customers]);

    return {
        customers: filteredCustomers,
        allCustomers: customers,
        stats,
        geoDistribution,
        topSpenders,
        customerGrowth,
        uniqueCities,
        uniqueProducts,
        loading: ordersLoading || dataLoading,
        error,
        refetch: fetchCustomerData,
    };
}
