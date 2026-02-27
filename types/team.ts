// =============================================
// TEAM DOMAIN TYPES
// Centralized type definitions for team/employee entities
// =============================================

export interface EmployeeStats {
    user_id: string;
    user_email: string;
    display_name: string | null;
    avatar_url: string | null;
    role: string;
    is_active: boolean;
    last_login_at: string | null;
    total_actions: number;
    status_changes: number;
    orders_created: number;
    orders_printed: number;
    orders_edited: number;
    logins: number;
}

export type OrderDuty = 'confirmation' | 'fulfillment';
export type RuleConditionType = 'city' | 'priority' | 'order_status' | 'product_selected';
export type RuleOperator = 'equals' | 'contains' | 'any';

export type EmployeeRole = 'admin' | 'support' | 'logistics' | 'manager';

export type EmployeeStatus = 'online' | 'away' | 'busy' | 'offline';

export type EmployeeThemeColor = 'gold' | 'blue' | 'green' | 'purple' | 'orange' | 'pink';

export interface Employee {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    role: EmployeeRole;
    avatar_url?: string;
    status: EmployeeStatus;
    theme_color: EmployeeThemeColor;
    created_at: string;
    is_active: boolean;
}

export interface OrderAssignment {
    id: string;
    order_id: string;
    employee_id: string;
    duty: OrderDuty;
    assigned_by?: string;
    assigned_at: string;
    completed_at?: string;
    status: 'pending' | 'in_progress' | 'completed';
}

export interface RuleCondition {
    field: RuleConditionType;
    operator: RuleOperator;
    value: string;
}

export interface AssignmentRule {
    id: string;
    name: string;
    description?: string;
    is_active: boolean;
    duty: OrderDuty;
    employee_id: string;
    conditions: RuleCondition[];
    created_at: string;
    priority: number;
}
