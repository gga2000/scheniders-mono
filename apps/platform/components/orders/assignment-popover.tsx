'use client';

import React, { useState } from 'react';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { OrderDuty, mockEmployees } from '@/lib/team-types';
import { UserPlus, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AssignmentPopoverProps {
    orderId: string;
    duty: OrderDuty;
    onAssign: (orderId: string, duty: OrderDuty, employeeId: string) => void;
    trigger?: React.ReactNode;
}

export function AssignmentPopover({ orderId, duty, onAssign, trigger }: AssignmentPopoverProps) {
    const [open, setOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    const filteredEmployees = mockEmployees.filter(emp =>
        emp.is_active &&
        (emp.first_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            emp.last_name.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    const title = duty === 'confirmation' ? 'Assign Confirmation' : 'Assign Fulfillment';

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                {trigger || (
                    <button className="inline-flex h-6 items-center gap-1.5 px-2.5 rounded-full border border-dashed border-gray-400/60 hover:border-blue-500 hover:bg-blue-50/50 text-[10px] font-semibold text-gray-500 hover:text-blue-700 transition-all dark:border-gray-600 dark:text-gray-400 dark:hover:border-blue-400/50 dark:hover:bg-blue-900/20 dark:hover:text-blue-400">
                        <UserPlus className="w-3 h-3" />
                        {title}
                    </button>
                )}
            </PopoverTrigger>

            <PopoverContent
                className="w-64 p-3 bg-white/90 dark:bg-gray-900/90 backdrop-blur-xl border border-gray-200/50 dark:border-gray-700/50 shadow-2xl rounded-2xl"
                align="start"
                sideOffset={8}
            >
                <div>
                    <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 px-1">
                        Select Team Member
                    </h4>

                    <div className="relative mb-3">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Search name..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-8 pr-3 py-1.5 text-sm bg-gray-100/50 dark:bg-black/20 border border-transparent rounded-lg focus:ring-1 focus:ring-blue-500 outline-none transition-shadow"
                        />
                    </div>

                    <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                        {filteredEmployees.length === 0 ? (
                            <div className="py-4 text-center text-xs text-gray-500">No members found</div>
                        ) : (
                            filteredEmployees.map(emp => (
                                <button
                                    key={emp.id}
                                    onClick={(e) => {
                                        e.preventDefault();
                                        onAssign(orderId, duty, emp.id);
                                        setOpen(false);
                                    }}
                                    className="w-full flex items-center justify-between p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-white/5 transition-colors group"
                                >
                                    <div className="flex items-center gap-2.5">
                                        <div className="relative">
                                            {emp.avatar_url ? (
                                                <img src={emp.avatar_url} alt={emp.first_name} className="w-8 h-8 rounded-full border border-gray-200 dark:border-gray-700 object-cover" />
                                            ) : (
                                                <div className="w-8 h-8 rounded-full bg-gradient-to-br flex items-center justify-center font-bold text-xs border border-gray-200/50 dark:border-gray-700/50"
                                                    style={{
                                                        background: 'linear-gradient(to bottom right, var(--pastel-blue), var(--pastel-blue-dark))',
                                                        color: 'var(--blue-800)'
                                                    }}>
                                                    {emp.first_name[0]}{emp.last_name[0]}
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex flex-col items-start min-w-0">
                                            <span className="text-sm font-semibold truncate text-gray-900 dark:text-gray-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                                                {emp.first_name} {emp.last_name}
                                            </span>
                                            <span className="text-[10px] text-gray-500 dark:text-gray-400 capitalize">{emp.role}</span>
                                        </div>
                                    </div>
                                    {/* Action indicator on hover */}
                                    <div className="w-5 h-5 rounded-full border border-gray-300 dark:border-gray-600 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all scale-75 group-hover:scale-100 bg-white dark:bg-gray-800">
                                        <div className="w-2.5 h-2.5 bg-blue-500 rounded-full scale-0 group-hover:scale-100 transition-transform delay-75" />
                                    </div>
                                </button>
                            ))
                        )}
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    );
}
