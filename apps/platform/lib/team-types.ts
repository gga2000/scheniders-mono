// =============================================
// RE-EXPORTS FROM CENTRALIZED TYPES
// All types that were previously defined here are now in @/types/team
// These re-exports maintain backward compatibility.
// =============================================
export type {
    EmployeeStats,
    OrderDuty,
    RuleConditionType,
    RuleOperator,
    EmployeeRole,
    EmployeeStatus,
    EmployeeThemeColor,
    Employee,
    OrderAssignment,
    RuleCondition,
    AssignmentRule,
} from '@/types/team';

import type { Employee, OrderAssignment, AssignmentRule } from '@/types/team';

// TODO: Replace with real database queries - these mock data exports are still used by order-related components
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
        employee_id: 'emp_2',
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
        employee_id: 'emp_4',
        conditions: [
            { field: 'priority', operator: 'equals', value: 'high' }
        ],
        created_at: new Date().toISOString(),
        priority: 20
    }
];
