export type OrderDuty = 'confirmation' | 'fulfillment';

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
