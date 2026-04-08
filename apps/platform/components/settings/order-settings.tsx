"use client";

import { Settings, Package, XCircle, MessageSquare } from "lucide-react";
import { RejectionReasonsList } from "@/components/settings/rejection-reasons-list";
import { DeliveryFeesForm } from "@/components/settings/delivery-fees-form";
import { WorkflowSettingsForm } from "@/components/settings/workflow-settings-form";
import { MessageTemplatesList } from "@/components/settings/message-templates-list";


export function OrderSettings() {
    return (
        <div className="space-y-4">
            <div>
                <h2 className="text-2xl font-bold tracking-tight text-foreground">Order Settings</h2>
                <p className="text-sm text-muted-foreground">Configure order processing workflows and defaults.</p>
            </div>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {/* Rejection Reasons - Takes up 1 column */}
                <div className="pastel-card p-6 md:col-span-1">
                    <div className="flex items-center gap-2 mb-4">
                        <div className="w-8 h-8 rounded-lg bg-[var(--pastel-pink)] flex items-center justify-center">
                            <XCircle className="h-4 w-4 text-rose-700" />
                        </div>
                        <h3 className="text-lg font-semibold text-foreground">Rejection Reasons</h3>
                    </div>
                    <p className="text-sm text-muted mb-4">Manage the list of reasons for rejecting orders.</p>
                    <RejectionReasonsList />
                </div>

                {/* Delivery Fees - Takes up 1 column */}
                <div className="pastel-card p-6 md:col-span-1">
                    <div className="flex items-center gap-2 mb-4">
                        <div className="w-8 h-8 rounded-lg bg-[var(--pastel-mint)] flex items-center justify-center">
                            <Package className="h-4 w-4 text-teal-700" />
                        </div>
                        <h3 className="text-lg font-semibold text-foreground">Delivery Fees</h3>
                    </div>
                    <p className="text-sm text-muted mb-4">Set default delivery prices for different regions.</p>
                    <DeliveryFeesForm />
                </div>

                {/* Workflow Rules - Takes up 1 column (or spans if needed) */}
                <div className="pastel-card p-6 md:col-span-1 lg:col-span-1">
                    <div className="flex items-center gap-2 mb-4">
                        <div className="w-8 h-8 rounded-lg bg-[var(--background)] border border-[var(--card-border)] flex items-center justify-center">
                            <Settings className="h-4 w-4 text-gray-600" />
                        </div>
                        <h3 className="text-lg font-semibold text-foreground">Workflow Rules</h3>
                    </div>
                    <WorkflowSettingsForm />
                </div>

                {/* Message Templates - Spans 2 cols on LG */}
                <div className="pastel-card p-6 md:col-span-2 lg:col-span-3">
                    <div className="flex items-center gap-2 mb-4">
                        <div className="w-8 h-8 rounded-lg bg-[var(--pastel-green)] flex items-center justify-center">
                            <MessageSquare className="h-4 w-4 text-green-700" />
                        </div>
                        <h3 className="text-lg font-semibold text-foreground">Message Templates</h3>
                    </div>
                    <p className="text-sm text-muted mb-4">Customize WhatsApp and SMS templates.</p>
                    <MessageTemplatesList />
                </div>
            </div>
        </div>
    );
}

