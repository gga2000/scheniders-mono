/// <reference types="vitest/globals" />
// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { AdCampaignChip } from "./ad-campaign-chip";

afterEach(cleanup);

describe("AdCampaignChip", () => {
    it("shows the campaign name with the full name as tooltip", () => {
        render(<AdCampaignChip attribution={{ channel: "facebook", campaign: "فيوجن" }} />);
        expect(screen.getByText("فيوجن").getAttribute("title")).toBe("فيوجن");
    });
    it("renders nothing without a campaign name", () => {
        const withoutName = render(<AdCampaignChip attribution={{ channel: "facebook" }} />);
        expect(withoutName.container.innerHTML).toBe("");
        cleanup();
        const none = render(<AdCampaignChip attribution={null} />);
        expect(none.container.innerHTML).toBe("");
    });
});
