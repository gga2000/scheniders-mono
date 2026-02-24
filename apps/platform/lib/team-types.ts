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
    // For the UI aura/theming
    theme_color: EmployeeThemeColor;
    created_at: string;
    is_active: boolean;
}

// An assignment mapping an order to an employee for a specific duty
export interface OrderAssignment {
    id: string;
    order_id: string;
    employee_id: string;
    duty: OrderDuty;
    assigned_by?: string; // admin who assigned it
    assigned_at: string;
    completed_at?: string; // when the duty was finished
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
    priority: number; // Higher number = higher priority when merging rules
}

// Mock Data to simulate Database
export const mockEmployees: Employee[] = [
    {
        id: 'emp_1',
        first_name: 'Karrar',
        last_name: 'Ahmed',
        email: 'karrar@scheniders.com',
        role: 'support',
        avatar_url: '',
        status: 'online',
        theme_color: 'blue',
        created_at: new Date().toISOString(),
        is_active: true
    },
    {
        id: 'emp_2',
        first_name: 'Noor',
        last_name: 'Ali',
        email: 'noor@scheniders.com',
        role: 'support',
        status: 'online',
        theme_color: 'pink',
        created_at: new Date().toISOString(),
        is_active: true
    },
    {
        id: 'emp_3',
        first_name: 'Ali',
        last_name: 'Admin',
        email: 'admin@scheniders.com',
        role: 'admin',
        status: 'online',
        theme_color: 'gold',
        created_at: new Date().toISOString(),
        is_active: true
    },
    {
        id: 'emp_4',
        first_name: 'Mohammed',
        last_name: 'Logistics',
        email: 'mohammed@scheniders.com',
        role: 'logistics',
        status: 'busy',
        theme_color: 'green',
        created_at: new Date().toISOString(),
        is_active: true
    },
];

export const mockAssignments: OrderAssignment[] = [];

export const mockAssignmentRules: AssignmentRule[] = [
    {
        id: 'rule_1',
        name: 'Baghdad Confirmation',
        description: 'Auto-assign Baghdad orders to Noor for confirmation.',
        is_active: true,
        duty: 'confirmation',
        employee_id: 'emp_2', // Noor
        conditions: [
            { field: 'city', operator: 'equals', value: 'بغداد' }
        ],
        created_at: new Date().toISOString(),
        priority: 10
    },
    {
        id: 'rule_2',
        name: 'High Priority Fulfillment',
        description: 'Mohammed handles immediate logistics.',
        is_active: true,
        duty: 'fulfillment',
        employee_id: 'emp_4', // Mohammed Logistics
        conditions: [
            { field: 'priority', operator: 'equals', value: 'high' }
        ],
        created_at: new Date().toISOString(),
        priority: 20
    }
];
