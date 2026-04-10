import type { Meta, StoryObj } from "@storybook/react";
import { Button } from "@scheniders/ui/button";

const meta: Meta<typeof Button> = {
    title: "UI/Button",
    component: Button,
    tags: ["autodocs"],
    argTypes: {
        variant: {
            control: "select",
            options: ["primary", "destructive", "financial", "outline", "ghost", "link"],
        },
        size: {
            control: "select",
            options: ["sm", "md", "lg", "icon"],
        },
        isLoading: {
            control: "boolean",
        },
        disabled: {
            control: "boolean",
        },
    },
};

export default meta;
type Story = StoryObj<typeof Button>;

export const Primary: Story = {
    args: {
        variant: "primary",
        children: "Primary Button",
    },
};

export const Destructive: Story = {
    args: {
        variant: "destructive",
        children: "Delete Item",
    },
};

export const Financial: Story = {
    args: {
        variant: "financial",
        children: "Pay Now",
    },
};

export const Outline: Story = {
    args: {
        variant: "outline",
        children: "Cancel",
        className: "bg-black/50", // Added to make it visible on white background if customized
    },
    parameters: {
        backgrounds: { default: 'dark' },
    }
};

export const Loading: Story = {
    args: {
        variant: "primary",
        isLoading: true,
        children: "Submitting...",
    },
};
