# Renders in progress

## Behaviour

A single list of every render this application currently knows about, on all three routes it
can run one on: as a local process, in a Docker container, and on GitHub's runners. It exists
because a render's own progress used to live only inside whichever screen started or was
watching it - navigating to another tab tore that view down, even though the render itself,
on every route, kept going untouched. See [Docker and local rendering](./docker-and-local.md)
and [Rendering in GitHub Actions](./render-in-actions.md) for how each route actually runs;
this page is where they are all watched from one place.

Each row shows which world and which project the render is for, its route, live progress and
throughput drawn through the same shared progress vocabulary the render console itself uses,
elapsed time and an estimate explicitly labelled as one, its current state, and the real error
text on a failure. **Open console** takes a local or container render to the Make-a-map tab,
already watching that render; a GitHub render opens the GitHub-runners tab, where it is already
listed. A container this application found running from an earlier launch but has not picked
back up yet shows as a **Reattach** offer rather than as an active render, and accepting it
promotes the row in place once the container starts reporting.

The page distinguishes **still checking** all three routes from **genuinely nothing running**,
and a third state for a search that matches neither. A tab-strip label carries a live count of
everything in progress for the whole life of the application, not only while this page happens
to be open, and the same destination is offered from the Home tab.

## Configuration

The search bar is wired to the shared regex builder; plain text matching is the default. Rows
can be multi-selected and stopped in bulk; because stopping a render is destructive to the work
still in flight (though never to tiles already drawn), bulk cancellation is gated behind the
super-confirmation slider. A single row's own **Stop** button is not gated, matching the render
console's own convention, because tiles already rendered are always kept and a stopped render
can be carried on later. Every row carries the shared per-element appearance editor through its
context menu and Shift+right-click.

## Failure modes

- A route this build cannot reach (no Electron bridge, no container-reattach channel, no CI
  bridge) is simply left out of the aggregation rather than shown as an error; the page still
  reports honestly on whichever routes it can reach.
- A container offer that fails to reattach reports the real refusal message on its own row and
  stays an offer rather than silently disappearing.
- Cancelling a render that has already ended between the click and the request reaching the
  main process is reported as nothing having changed, never as a false success.

## Security considerations

Nothing here elevates any capability beyond what the render, container-reattach and CI-render
bridges already expose individually; this page only aggregates their existing read and cancel
operations into one list. No credential, token or secret crosses this surface.

## Verification

`activeRenders.test.ts` covers the aggregation model directly: a fresh instance discovering a
render already in flight (the regression test for the reported defect), a container offer
promoted to a tracked row on reattach, a GitHub render's real polled status, cancellation
dispatched to the correct route, and the honest error text on a failure. `RendersScreen.test.ts`
covers the mounted page: the two empty states, a render surviving an unmount-and-remount cycle
with live progress intact, the **Open console** navigation target, and that a bare click on the
bulk **Stop** button never cancels anything on its own - only the super-confirmation gate does.

## Suggested articles

- [Render console](./render-console.md) for the single-render detail view this page's **Open
  console** action leads to.
- [Docker and local rendering](./docker-and-local.md) for how a container survives the
  application closing, and how it is found again.
- [Rendering in GitHub Actions](./render-in-actions.md) for the third route, entirely
  independent of this application.
- [Super-confirmation for destructive actions](./super-confirmation.md) for the gate bulk
  cancellation goes through.
- [The regex builder and the search bars it reaches](./regex-builder.md) for the shared search
  contract this page's search bar uses.
