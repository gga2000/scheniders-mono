import re

with open('app/orders/page.tsx', 'r') as f:
    content = f.read()

# Add imports
if 'from \'@/components/orders/virtualized-order-table\'' not in content:
    content = content.replace("import { StickyFilterBar } from '@/components/orders/sticky-filter-bar';", "import { StickyFilterBar } from '@/components/orders/sticky-filter-bar';\nimport { VirtualizedOrderTable } from '@/components/orders/virtualized-order-table';")

# Find the start of the table view
start_idx = content.find('{/* Table View - State of the Art */}')
if start_idx != -1:
    # Find the end of the table view block (right before Kanban)
    end_idx = content.find('{/* Kanban View */}', start_idx)
    
    if end_idx != -1:
        replacement = """{/* Table View - State of the Art */}
                                {viewMode === "table" && (
                                    <VirtualizedOrderTable
                                        groupedOrders={groupedOrders}
                                        groupBy={groupBy}
                                        displayedOrders={displayedOrders}
                                        sortConfig={sortConfig}
                                        toggleSort={toggleSort}
                                        selectedOrders={selectedOrders}
                                        selectAll={selectAll}
                                        toggleOrderSelection={toggleOrderSelection}
                                        togglePin={togglePin}
                                        setSelectedOrder={setSelectedOrder}
                                        setIsModalOpen={setIsModalOpen}
                                        phoneCounts={phoneCounts}
                                        setDuplicateOrder={setDuplicateOrder}
                                        setShowDuplicateModal={setShowDuplicateModal}
                                        modePrice={modePrice}
                                        updateOrderStatus={updateOrderStatus}
                                        getRiskLevel={getRiskLevel}
                                        columnFilters={columnFilters}
                                        setColumnFilters={setColumnFilters}
                                        openFilterColumn={openFilterColumn}
                                        setOpenFilterColumn={setOpenFilterColumn}
                                        availableCities={availableCities}
                                        availableProducts={availableProducts}
                                        filters={filters}
                                        setFilters={setFilters}
                                    />
                                )}

                                """
        new_content = content[:start_idx] + replacement + content[end_idx:]
        
        with open('app/orders/page.tsx', 'w') as f:
            f.write(new_content)
        print("Successfully replaced Table View block")
    else:
        print("Could not find Kanban View block")
else:
    print("Could not find Table View start")
