<script setup lang="ts">
import EulaViewer from "../eula/EulaViewer.vue";
import SetupText from "./SetupText.vue";

/**
 * Step two: Mojang's licence, on screen, before anybody is asked about it.
 *
 * What this replaces is the reason it exists. The consent question used to quote four
 * lines of BlueMap's summary and offer a link to the document itself, which meant the
 * application asked people to accept a licence it had never shown them, and the only
 * route to the actual text was a link that opened a browser and left the setup dialog
 * behind. A person following the render wizard fared worse still: they were told the
 * render had stopped, sent to Settings, and left to scroll.
 *
 * So the document is a step. It has a progress number, it comes before the question, and
 * the only control on it is Next - there is nothing here to accept or decline, and
 * {@link SetupText} says so in as many words. Reading is not agreeing, and a step that
 * carried an Accept button would be a step that got clicked rather than read.
 *
 * The viewer is the real one, mounted in compact mode. Everything it does elsewhere it
 * does here: the tabs, their searches, the appearance editor on the text, the export, and
 * the header that says whether this is Mojang's live document, a copy from a date, or
 * BlueMap's own wording because nothing could be fetched.
 */
</script>

<template>
    <div class="mb-setup-step">
        <SetupText tag="h2" text-key="eula.title" class="mb-setup-step__heading" />
        <SetupText text-key="eula.readingIsNotAgreeing" class="mb-setup-step__lead" />

        <EulaViewer compact />
    </div>
</template>
