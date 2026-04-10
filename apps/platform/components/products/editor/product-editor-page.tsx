"use client";

import { useProductEditor } from "@/hooks/use-product-editor";
import type { Product } from "@/types/product";
import { ProductEditorHeader } from "./product-editor-header";
import { ProductEditorSidebar } from "./product-editor-sidebar";
import { ProductBasicSection } from "./product-basic-section";
import { ProductPricingSection } from "./product-pricing-section";
import { ProductInventorySection } from "./product-inventory-section";
import { ProductMediaSection } from "./product-media-section";
import { ProductStorefrontSection } from "./product-storefront-section";
import { VariantOptionsBuilder } from "./variant-options-builder";
import { VariantMatrixTable } from "./variant-matrix-table";
import type { VariantRowData } from "./variant-matrix-table";
import { ProductTypeSelector } from "./product-type-selector";
import { PhysicalFieldsSection } from "./physical-fields-section";
import { DigitalFieldsSection } from "./digital-fields-section";
import { ServiceFieldsSection } from "./service-fields-section";
import { BundleBuilderSection } from "./bundle-builder-section";
import { TieredPricingSection } from "./tiered-pricing-section";
import { OrderBumpsSection } from "./order-bumps-section";
import { RelatedProductsSection } from "./related-products-section";
import { ProductCMSTabs } from "./product-cms-tabs";
import { InventoryTimeline } from "./inventory-timeline";
import { ReorderAlertsSection } from "./reorder-alerts-section";
import { SupplierSection } from "./supplier-section";
import { PriceHistoryChart } from "./price-history-chart";
import { ActivityLogSection } from "./activity-log-section";
import { StorefrontPreview } from "./storefront-preview";
import { CollapsibleSection } from "./collapsible-section";
import { AdvancedOptionsSection } from "./advanced-options-section";
import { AnimatePresence, motion } from "framer-motion";
import { TrendingUp, Clock, Package, Zap, Link as LinkIcon, Weight, Truck } from "lucide-react";

interface ProductEditorPageProps {
    product?: Product | null;
    mode: "create" | "edit";
}

export function ProductEditorPage({ product, mode }: ProductEditorPageProps) {
    const editor = useProductEditor({ product, mode });

    return (
        <div className="min-h-screen bg-[var(--background)]">
            <ProductEditorHeader
                productName={editor.formData.name}
                mode={mode}
                isDirty={editor.isDirty}
                saving={editor.saving}
                status={editor.formData.status}
                onSave={editor.save}
                onDiscard={editor.discard}
                onDuplicate={mode === "edit" ? editor.duplicateProduct : undefined}
            />

            {/* Draft recovery banner */}
            <AnimatePresence>
                {editor.hasDraft && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="max-w-7xl mx-auto px-6"
                    >
                        <div className="mt-4 p-4 bg-[var(--pastel-blue)] rounded-xl flex items-center justify-between">
                            <p className="text-sm text-blue-800">
                                You have an unsaved draft from a previous session. Would you like to restore it?
                            </p>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={editor.dismissDraft}
                                    className="px-3 py-1.5 text-sm text-blue-700 hover:text-blue-900 transition-colors"
                                >
                                    Dismiss
                                </button>
                                <button
                                    onClick={editor.handleRestoreDraft}
                                    className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
                                >
                                    Restore Draft
                                </button>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Two-column layout */}
            <div className="max-w-7xl mx-auto px-6 py-8">
                <div className="flex flex-col lg:flex-row gap-8">
                    {/* Main content */}
                    <div className="flex-1 min-w-0 space-y-6">
                        {/* === CORE SECTIONS === */}
                        <ProductTypeSelector
                            value={editor.formData.product_type}
                            onChange={(type) => editor.updateField("product_type", type)}
                            mode={mode}
                        />

                        <ProductBasicSection
                            formData={editor.formData}
                            updateField={editor.updateField}
                        />

                        <ProductMediaSection
                            formData={editor.formData}
                            updateField={editor.updateField}
                            productId={product?.id}
                        />

                        <ProductPricingSection
                            formData={editor.formData}
                            updateField={editor.updateField}
                            profitMargin={editor.profitMargin}
                            profitAmount={editor.profitAmount}
                            discountPercentage={editor.discountPercentage}
                        />

                        {/* Type-specific fields */}
                        {editor.formData.product_type === "digital" && (
                            <DigitalFieldsSection
                                formData={editor.formData}
                                updateField={editor.updateField}
                                productId={product?.id}
                            />
                        )}

                        {editor.formData.product_type === "service" && (
                            <ServiceFieldsSection
                                formData={editor.formData}
                                updateField={editor.updateField}
                            />
                        )}

                        {editor.formData.product_type === "bundle" && (
                            <BundleBuilderSection
                                formData={editor.formData}
                                updateField={editor.updateField}
                                currentProductId={product?.id}
                            />
                        )}

                        {/* === VARIANTS (moved up — important for physical products) === */}
                        {!editor.formData.is_supply && editor.formData.product_type === "physical" && (
                            <>
                                <VariantOptionsBuilder
                                    options={editor.formData.variant_options}
                                    onChange={editor.updateVariantOptions}
                                />
                                {editor.formData.variants.length > 0 && (
                                    <VariantMatrixTable
                                        variants={editor.formData.variants as VariantRowData[]}
                                        options={editor.formData.variant_options.filter(o => o.name.trim() && o.values.length > 0)}
                                        onUpdateVariant={editor.updateVariantRow}
                                        onApplyToAll={editor.applyToAllVariants}
                                        productSku={editor.formData.sku}
                                        productPrice={editor.formData.price}
                                        productCost={editor.formData.cost}
                                    />
                                )}
                            </>
                        )}

                        {/* === STOREFRONT & INVENTORY === */}
                        <ProductStorefrontSection
                            formData={editor.formData}
                            updateField={editor.updateField}
                            autoGenerateSlug={editor.autoGenerateSlug}
                        />

                        {editor.formData.product_type !== "digital" && editor.formData.product_type !== "service" && (
                            <>
                                <ProductInventorySection
                                    formData={editor.formData}
                                    updateField={editor.updateField}
                                    reservedQuantity={product?.reserved_quantity}
                                />
                                <ReorderAlertsSection
                                    formData={editor.formData}
                                    updateField={editor.updateField}
                                />
                            </>
                        )}

                        {/* === CMS TABS (features, FAQs, testimonials, reviews) === */}
                        <ProductCMSTabs
                            features={editor.formData.features}
                            onFeaturesChange={(features) => editor.updateField("features", features)}
                            faqs={editor.formData.faqs}
                            onFaqsChange={(faqs) => editor.updateField("faqs", faqs)}
                            testimonials={editor.formData.testimonials}
                            onTestimonialsChange={(testimonials) => editor.updateField("testimonials", testimonials)}
                            reviews={editor.formData.reviews}
                            onReviewsChange={(reviews) => editor.updateField("reviews", reviews)}
                        />

                        {/* === STOREFRONT PREVIEW === */}
                        {!editor.formData.is_supply && (
                            <StorefrontPreview
                                name={editor.formData.name}
                                description={editor.formData.description}
                                shortDescription={editor.formData.short_description}
                                price={editor.formData.price}
                                compareAtPrice={editor.formData.compare_at_price}
                                imageUrl={editor.formData.image_url}
                                features={editor.formData.features}
                                faqs={editor.formData.faqs}
                                testimonials={editor.formData.testimonials}
                                reviews={editor.formData.reviews.filter(r => r.status === "approved" || r.status === "featured")}
                                slug={editor.formData.slug}
                                variantOptions={editor.formData.variant_options.filter(o => o.name.trim() && o.values.length > 0)}
                            />
                        )}

                        {/* === ADVANCED OPTIONS (all collapsible, grouped together) === */}
                        <AdvancedOptionsSection>
                            {!editor.formData.is_supply && (
                                <CollapsibleSection title="Volume Pricing" icon={<TrendingUp className="w-4 h-4 text-muted" />} badge={editor.formData.tiered_prices.length || undefined}>
                                    <TieredPricingSection
                                        tiers={editor.formData.tiered_prices}
                                        onChange={(tiers) => editor.updateField("tiered_prices", tiers)}
                                        basePrice={editor.formData.price}
                                    />
                                </CollapsibleSection>
                            )}

                            {editor.formData.product_type === "physical" && (
                                <CollapsibleSection title="Shipping & Dimensions" icon={<Weight className="w-4 h-4 text-muted" />}>
                                    <PhysicalFieldsSection
                                        formData={editor.formData}
                                        updateField={editor.updateField}
                                    />
                                </CollapsibleSection>
                            )}

                            {editor.formData.product_type !== "digital" && editor.formData.product_type !== "service" && (
                                <>
                                    <CollapsibleSection title="Inventory History" icon={<Clock className="w-4 h-4 text-muted" />} badge={editor.formData.inventory_history.length || undefined}>
                                        <InventoryTimeline
                                            entries={editor.formData.inventory_history}
                                            onChange={(entries) => editor.updateField("inventory_history", entries)}
                                        />
                                    </CollapsibleSection>

                                    <CollapsibleSection title="Suppliers" icon={<Truck className="w-4 h-4 text-muted" />} badge={editor.formData.suppliers.length || undefined}>
                                        <SupplierSection
                                            suppliers={editor.formData.suppliers}
                                            onChange={(suppliers) => editor.updateField("suppliers", suppliers)}
                                        />
                                    </CollapsibleSection>
                                </>
                            )}

                            {!editor.formData.is_supply && (
                                <CollapsibleSection title="Order Bumps" icon={<Zap className="w-4 h-4 text-muted" />} badge={editor.formData.order_bumps.length || undefined}>
                                    <OrderBumpsSection
                                        bumps={editor.formData.order_bumps}
                                        onChange={(bumps) => editor.updateField("order_bumps", bumps)}
                                        currentProductId={product?.id}
                                    />
                                </CollapsibleSection>
                            )}

                            <CollapsibleSection title="Related Products" icon={<LinkIcon className="w-4 h-4 text-muted" />} badge={editor.formData.related_products.length || undefined}>
                                <RelatedProductsSection
                                    relatedProducts={editor.formData.related_products}
                                    onChange={(products) => editor.updateField("related_products", products)}
                                    currentProductId={product?.id}
                                />
                            </CollapsibleSection>

                            {mode === "edit" && (
                                <CollapsibleSection title="Price History" icon={<TrendingUp className="w-4 h-4 text-muted" />}>
                                    <PriceHistoryChart
                                        entries={editor.formData.price_history}
                                        currentPrice={editor.formData.price}
                                    />
                                </CollapsibleSection>
                            )}

                            {mode === "edit" && (
                                <CollapsibleSection title="Activity Log" icon={<Clock className="w-4 h-4 text-muted" />} badge={editor.formData.activity_log.length || undefined}>
                                    <ActivityLogSection
                                        entries={editor.formData.activity_log}
                                    />
                                </CollapsibleSection>
                            )}
                        </AdvancedOptionsSection>
                    </div>

                    {/* Sidebar */}
                    <div className="w-full lg:w-80 shrink-0">
                        <div className="lg:sticky lg:top-24">
                            <ProductEditorSidebar
                                formData={editor.formData}
                                updateField={editor.updateField}
                                mode={mode}
                                timesSold={product?.times_sold}
                                totalRevenue={product?.total_revenue}
                                profitMargin={editor.profitMargin}
                                averageOrderValue={product?.average_order_value}
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
