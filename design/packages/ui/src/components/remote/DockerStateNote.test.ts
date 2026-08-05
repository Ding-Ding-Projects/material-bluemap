/**
 * @vitest-environment jsdom
 *
 * The "Show what Docker said" disclosure keeps its `aria-expanded` toggle pointed at the
 * region it reveals.
 *
 * Vuetify's `v-btn` has no built-in `aria-controls` wiring - it is a plain button, not
 * `v-expansion-panel` - so a screen reader only learns the toggle expanded or collapsed
 * *something*, never *which* region, unless this component supplies the id/aria-controls
 * pairing itself.
 */

import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import DockerStateNote from "./DockerStateNote.vue";
import type { DockerNote } from "./dockerStates.js";

const i18n = createI18n({ legacy: false, locale: "none", fallbackLocale: "none", messages: {} });
const vuetify = createVuetify();

const note: DockerNote = {
    status: "available",
    tone: "success",
    headline: "Docker 29.6.1 is installed and its daemon is running.",
    explanation: "A container can be started right now.",
    nextStep: "Nothing to do.",
    detail: "Client: Docker Engine - Community\n Version: 29.6.1",
    usable: true,
};

function mountNote() {
    return mount(DockerStateNote, {
        props: { note },
        global: { plugins: [i18n, vuetify] },
    });
}

describe("the 'Show what Docker said' disclosure's aria wiring", () => {
    it("points aria-controls at the id of the region it reveals", async () => {
        const wrapper = mountNote();

        const toggle = wrapper.find("button");
        expect(toggle.exists()).toBe(true);
        expect(toggle.attributes("aria-expanded")).toBe("false");

        // The defect this guards: aria-expanded with no aria-controls at all, which leaves
        // a screen-reader user knowing something toggled without ever learning what.
        const controls = toggle.attributes("aria-controls");
        expect(controls).toBeTruthy();
        expect(wrapper.find(".mb-remote-docker__detail").exists()).toBe(false);

        await toggle.trigger("click");

        expect(toggle.attributes("aria-expanded")).toBe("true");
        const detail = wrapper.find(".mb-remote-docker__detail");
        expect(detail.exists()).toBe(true);
        // The revealed <pre> must carry exactly the id the button's aria-controls named -
        // not merely some id, but the programmatic pairing aria-controls promises.
        expect(detail.attributes("id")).toBe(controls);
    });
});
