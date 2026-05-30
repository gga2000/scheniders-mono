'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Trash2, Power, PowerOff, ShieldAlert, Settings2, MapPin, Flag, HelpCircle, Package, Truck, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AssignmentRule, RuleConditionType, OrderDuty } from '@/lib/team-types';
import { useLanguage } from '@/hooks/use-language';

interface EmployeeOption {
    id: string;
    name: string;
    avatarUrl?: string | null;
}

interface AssignmentRulesTabProps {
    employees?: EmployeeOption[];
}

const RULES_STORAGE_KEY = "assignment-rules";

function loadRulesFromStorage(): AssignmentRule[] {
    if (typeof window === 'undefined') return [];
    try {
        const stored = localStorage.getItem(RULES_STORAGE_KEY);
        return stored ? JSON.parse(stored) : [];
    } catch {
        return [];
    }
}

function saveRulesToStorage(rules: AssignmentRule[]) {
    localStorage.setItem(RULES_STORAGE_KEY, JSON.stringify(rules));
}

export function AssignmentRulesTab({ employees = [] }: AssignmentRulesTabProps) {
    const { t } = useLanguage();
    const [rules, setRules] = useState<AssignmentRule[]>(() => loadRulesFromStorage());
    const [isCreating, setIsCreating] = useState(false);
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

    // Form State
    const [newName, setNewName] = useState('');
    const [newDuty, setNewDuty] = useState<OrderDuty>('confirmation');
    const [newEmployeeId, setNewEmployeeId] = useState('');
    const [newConditionField, setNewConditionField] = useState<RuleConditionType>('city');
    const [newConditionValue, setNewConditionValue] = useState('');

    const updateRules = (newRules: AssignmentRule[]) => {
        setRules(newRules);
        saveRulesToStorage(newRules);
    };

    const handleToggleRule = (id: string) => {
        updateRules(rules.map(r => r.id === id ? { ...r, is_active: !r.is_active } : r));
    };

    const handleDeleteRule = (id: string) => {
        updateRules(rules.filter(r => r.id !== id));
        setConfirmDeleteId(null);
    };

    const handleCreateRule = () => {
        if (!newName || !newEmployeeId || !newConditionValue) return;

        const newRule: AssignmentRule = {
            id: `rule_${Date.now()}`,
            name: newName,
            is_active: true,
            duty: newDuty,
            employee_id: newEmployeeId,
            conditions: [
                { field: newConditionField, operator: 'equals', value: newConditionValue }
            ],
            created_at: new Date().toISOString(),
            priority: rules.length > 0 ? Math.max(...rules.map(r => r.priority)) + 10 : 10
        };

        updateRules([newRule, ...rules]);
        setIsCreating(false);
        setNewName('');
        setNewConditionValue('');
        setNewEmployeeId('');
    };

    return (
        <div className="space-y-6">
            {/* Header Area */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        <Settings2 className="w-6 h-6 text-indigo-500" />
                        {t("team.rules.title", "Auto-Assignment Rules")}
                    </h2>
                    <p className="text-gray-500 text-sm mt-1">{t("team.rules.subtitle", "Set up rules to automatically assign orders to employees based on conditions.")}</p>
                </div>

                <button
                    onClick={() => setIsCreating(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl font-bold hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors shadow-sm"
                >
                    <Plus className="w-4 h-4" />
                    {t("team.rules.newRule", "New Rule")}
                </button>
            </div>

            {/* Rule Builder Panel */}
            <AnimatePresence>
                {isCreating && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden"
                    >
                        <div className="bg-white dark:bg-[#1A1A1A] border-2 border-indigo-100 dark:border-indigo-500/20 rounded-2xl p-6 shadow-xl shadow-indigo-500/5 mb-6">
                            <div className="flex items-center justify-between mb-6">
                                <h3 className="text-lg font-bold text-gray-900 dark:text-white">{t("team.rules.createRule", "Create new assignment rule")}</h3>
                                <button onClick={() => setIsCreating(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 px-3 py-1 text-sm font-semibold bg-gray-100 dark:bg-gray-800 rounded-lg">{t("team.rules.cancel", "Cancel")}</button>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* Left Col - General Info & Assignment */}
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">{t("team.rules.ruleName", "Rule Name")}</label>
                                        <input
                                            type="text"
                                            placeholder={t("team.rules.namePlaceholder", "e.g., Baghdad Confirmation Orders")}
                                            value={newName}
                                            onChange={e => setNewName(e.target.value)}
                                            className="w-full bg-gray-50 dark:bg-black/20 border border-gray-200 dark:border-gray-800 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-indigo-500/50"
                                        />
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">{t("team.rules.dutyType", "Duty Type")}</label>
                                            <select
                                                value={newDuty}
                                                onChange={e => setNewDuty(e.target.value as OrderDuty)}
                                                className="w-full bg-gray-50 dark:bg-black/20 border border-gray-200 dark:border-gray-800 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-indigo-500/50"
                                            >
                                                <option value="confirmation">{t("team.rules.confirmation", "Confirmation")}</option>
                                                <option value="fulfillment">{t("team.rules.fulfillment", "Fulfillment")}</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">{t("team.rules.assignedEmployee", "Assigned Employee")}</label>
                                            <select
                                                value={newEmployeeId}
                                                onChange={e => setNewEmployeeId(e.target.value)}
                                                className="w-full bg-gray-50 dark:bg-black/20 border border-gray-200 dark:border-gray-800 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-indigo-500/50"
                                            >
                                                <option value="" disabled>{t("team.rules.selectEmployee", "Select employee")}</option>
                                                {employees.map(emp => (
                                                    <option key={emp.id} value={emp.id}>{emp.name}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                </div>

                                {/* Right Col - Conditions */}
                                <div className="space-y-4 bg-gray-50/50 dark:bg-black/10 p-4 rounded-xl border border-gray-100 dark:border-gray-800/50">
                                    <h4 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                        <HelpCircle className="w-4 h-4 text-gray-400" />
                                        {t("team.rules.conditions", "Assignment Conditions")}
                                    </h4>

                                    <div className="flex items-center gap-2">
                                        <span className="text-sm text-gray-500 w-8">{t("team.rules.if", "If")}</span>
                                        <select
                                            value={newConditionField}
                                            onChange={e => setNewConditionField(e.target.value as RuleConditionType)}
                                            className="flex-1 bg-white dark:bg-black border border-gray-200 dark:border-gray-800 rounded-lg px-3 py-2 outline-none text-sm"
                                        >
                                            <option value="city">{t("team.rules.city", "City")}</option>
                                            <option value="priority">{t("team.rules.priority", "Priority")}</option>
                                            <option value="order_status">{t("team.rules.status", "Status")}</option>
                                        </select>
                                        <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">{t("team.rules.equals", "equals")}</span>
                                    </div>

                                    <div className="flex items-center gap-2 pl-10">
                                        <input
                                            type="text"
                                            placeholder={t("team.rules.valuePlaceholder", "Enter value (e.g., Baghdad)")}
                                            value={newConditionValue}
                                            onChange={e => setNewConditionValue(e.target.value)}
                                            className="w-full bg-white dark:bg-black border border-gray-200 dark:border-gray-800 rounded-lg px-3 py-2 outline-none text-sm"
                                        />
                                    </div>
                                    <p className="text-[10px] text-gray-400 pl-10">{t("team.rules.conditionNote", "This rule will be applied when all conditions are met.")}</p>
                                </div>
                            </div>

                            <div className="mt-6 border-t border-gray-100 dark:border-gray-800 pt-5 flex justify-end">
                                <button
                                    onClick={handleCreateRule}
                                    disabled={!newName || !newEmployeeId || !newConditionValue}
                                    className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 disabled:bg-indigo-400 text-white rounded-xl font-bold hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-500/20"
                                >
                                    <CheckCircle2 className="w-4 h-4" />
                                    {t("team.rules.saveBtn", "Save and Activate")}
                                </button>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* List of Rules */}
            <div className="grid gap-4">
                {rules.length === 0 && !isCreating && (
                    <div className="text-center py-12 bg-white/50 dark:bg-black/20 border border-dashed border-gray-200 dark:border-gray-800 rounded-3xl">
                        <Settings2 className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                        <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1">{t("team.rules.noRules", "No assignment rules")}</h3>
                        <p className="text-gray-500 text-sm">{t("team.rules.noRulesNote", "Create your first rule to automate team workflows.")}</p>
                    </div>
                )}

                {[...rules].sort((a, b) => b.priority - a.priority).map((rule) => {
                    const employee = employees.find(e => e.id === rule.employee_id);
                    const isConfirmation = rule.duty === 'confirmation';

                    return (
                        <motion.div
                            key={rule.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className={cn(
                                "group bg-white dark:bg-[#1A1A1A] border rounded-2xl p-5 flex flex-col md:flex-row md:items-center gap-6 transition-all",
                                rule.is_active ? "border-gray-200 dark:border-gray-800 shadow-sm" : "border-gray-100 dark:border-gray-800/50 opacity-60"
                            )}
                        >
                            {/* Visual Indicator of the Rule */}
                            <div className="shrink-0 flex items-center gap-4">
                                <div className="flex items-center">
                                    <div className="w-12 h-12 rounded-xl bg-gray-50 dark:bg-black/50 border border-gray-100 dark:border-gray-800 flex items-center justify-center relative z-10">
                                        <Package className="w-6 h-6 text-gray-400" />
                                    </div>
                                    <div className="w-8 h-px bg-gray-300 dark:bg-gray-700" />
                                    <div className={cn(
                                        "w-12 h-12 rounded-xl flex items-center justify-center border shadow-sm relative z-10",
                                        isConfirmation
                                            ? "bg-indigo-50 text-indigo-600 border-indigo-200 dark:bg-indigo-500/10 dark:text-indigo-400 dark:border-indigo-500/20"
                                            : "bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20"
                                    )}>
                                        {isConfirmation ? <HelpCircle className="w-6 h-6" /> : <Truck className="w-6 h-6" />}
                                    </div>
                                    <div className="w-8 h-px bg-gray-300 dark:bg-gray-700" />
                                    <div className="w-12 h-12 rounded-xl bg-gray-100 dark:bg-gray-800 border-2 border-white dark:border-[#1A1A1A] shadow-md flex items-center justify-center relative z-10 overflow-hidden">
                                        {employee?.avatarUrl ? (
                                            <img loading="lazy" decoding="async" src={employee.avatarUrl} alt="" className="w-full h-full object-cover" />
                                        ) : (
                                            <span className="font-bold text-gray-600 dark:text-gray-300">
                                                {employee?.name?.[0]}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Rule Details */}
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between mb-1">
                                    <h3 className="text-lg font-bold text-gray-900 dark:text-white truncate">{rule.name}</h3>
                                    <div className={cn(
                                        "px-2 py-0.5 rounded-md text-[10px] font-bold border",
                                        rule.is_active ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20" : "bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700"
                                    )}>
                                        {rule.is_active ? t("team.rules.active", "Active") : t("team.rules.inactive", "Inactive")}
                                    </div>
                                </div>
                                <p className="text-sm text-gray-500 truncate mb-3">
                                    {t("team.rules.if", "If")} <strong>{rule.conditions[0].field}</strong> {t("team.rules.equals", "equals")} <strong>"{rule.conditions[0].value}"</strong>
                                </p>

                                <div className="flex items-center gap-3 text-xs flex-wrap">
                                    <span className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded-md">
                                        {t("team.rules.assignTo", "Assign to:")} <strong className="text-gray-900 dark:text-white">{employee?.name || t("team.rules.unassigned", "Unassigned")}</strong>
                                    </span>
                                    <span className={cn(
                                        "px-2 py-1 rounded-md font-semibold font-mono",
                                        isConfirmation ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-400" : "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400"
                                    )}>
                                        {isConfirmation ? t("team.rules.confirmation", "Confirmation") : t("team.rules.fulfillment", "Fulfillment")}
                                    </span>
                                    <span className="px-2 py-1 rounded-md font-mono font-semibold bg-gray-50 text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                                        {t("team.rules.priorityLabel", "Priority:")} {rule.priority}
                                    </span>
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="shrink-0 flex items-center gap-2 border-t md:border-t-0 md:border-r border-gray-100 dark:border-gray-800 pt-4 md:pt-0 md:pr-6">
                                <button
                                    onClick={() => handleToggleRule(rule.id)}
                                    className={cn(
                                        "w-10 h-10 rounded-xl flex items-center justify-center transition-all",
                                        rule.is_active ? "text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-500/10" : "text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-500/10"
                                    )}
                                    title={rule.is_active ? t("team.rules.deactivate", "Deactivate") : t("team.rules.activate", "Activate")}
                                >
                                    {rule.is_active ? <PowerOff className="w-5 h-5" /> : <Power className="w-5 h-5" />}
                                </button>
                                {confirmDeleteId === rule.id ? (
                                    <div className="flex items-center gap-1.5 bg-white dark:bg-[#1A1A1A] border border-gray-200 dark:border-white/10 rounded-xl p-1.5 shadow-lg">
                                        <button
                                            onClick={() => handleDeleteRule(rule.id)}
                                            className="px-2.5 py-1 rounded-lg bg-rose-500 text-white text-xs font-bold hover:bg-rose-600 transition-colors"
                                        >
                                            {t("team.rules.delete", "Delete")}
                                        </button>
                                        <button
                                            onClick={() => setConfirmDeleteId(null)}
                                            className="px-2.5 py-1 rounded-lg text-xs font-bold text-gray-500 hover:bg-gray-50 dark:hover:bg-white/10 transition-colors"
                                        >
                                            {t("team.rules.cancel", "Cancel")}
                                        </button>
                                    </div>
                                ) : (
                                    <button
                                        onClick={() => setConfirmDeleteId(rule.id)}
                                        className="w-10 h-10 rounded-xl flex items-center justify-center text-gray-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors"
                                    >
                                        <Trash2 className="w-5 h-5" />
                                    </button>
                                )}
                            </div>
                        </motion.div>
                    );
                })}
            </div>
        </div>
    );
}
