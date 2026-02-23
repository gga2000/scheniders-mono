import re

with open('components/orders/order-details-modal.tsx', 'r') as f:
    content = f.read()

# Add imports
imports = """import { OrderCustomerCard } from "./order-customer-card";
import { OrderItemsEditor } from "./order-items-editor";
import { OrderNotes } from "./order-notes";
"""
content = content.replace('import { DiscountPresetSelector } from "./discount-preset-selector";', imports + 'import { DiscountPresetSelector } from "./discount-preset-selector";')

# Replace Details Tab Content block
start_marker = '{/* Details Content (default) */}'
end_marker = '{/* Rejection Reason */}'

start_idx = content.find(start_marker)
end_idx = content.find(end_marker)

if start_idx != -1 and end_idx != -1:
    replacement = """{/* Details Content (default) */}
                    {activeTab === "details" && (
                        <div className="space-y-3 max-h-[50vh] overflow-y-auto -mr-2 pr-4">

                            {/* Customer Info Card - Compact & Organized */}
                            <OrderCustomerCard
                                isEditing={isEditing}
                                order={order}
                                formData={formData}
                                updateFormData={updateFormData}
                                onStatusUpdate={onStatusUpdate}
                                isUpdatingStatus={isUpdatingStatus}
                                handleStatusChange={handleStatusChange}
                            />

                            {/* Products Card */}
                            <OrderItemsEditor
                                isEditing={isEditing}
                                order={order}
                                formData={formData}
                                updateFormData={updateFormData}
                                handleAddItem={handleAddItem}
                                handleUpdateItemQuantity={handleUpdateItemQuantity}
                                handleRemoveItem={handleRemoveItem}
                            />

                            {/* Notes Cards */}
                            <OrderNotes
                                isEditing={isEditing}
                                order={order}
                                formData={formData}
                                updateFormData={updateFormData}
                            />

                            """
    content = content[:start_idx] + replacement + content[end_idx:]
    with open('components/orders/order-details-modal.tsx', 'w') as f:
        f.write(content)
    print("Successfully rewritten details modal to use external components")
else:
    print("Could not find start or end markers for replacement")
