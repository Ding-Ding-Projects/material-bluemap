import type { ConfigFileId } from "../meta.js";
import { coreConfigDescriptor } from "./core.js";
import type { ConfigFileDescriptor } from "./descriptor.js";
import { mapConfigDescriptor } from "./map.js";
import { pluginConfigDescriptor } from "./plugin.js";
import { fileStorageDescriptor, sqlStorageDescriptor } from "./storage.js";
import { webappConfigDescriptor } from "./webapp.js";
import { webserverConfigDescriptor } from "./webserver.js";

export * from "./common.js";
export * from "./descriptor.js";
export * from "./mask.js";
export * from "./core.js";
export * from "./webapp.js";
export * from "./webserver.js";
export * from "./plugin.js";
export * from "./map.js";
export * from "./storage.js";

/**
 * Every configuration file BlueMap reads.
 *
 * A settings GUI generated from this list covers the whole of BlueMap's
 * configuration, so a person never has to open one of these files in a text
 * editor to change something. The two storage descriptors are the two concrete
 * subclasses of one file, not two separate files.
 */
export const CONFIG_DESCRIPTORS = [
    coreConfigDescriptor,
    webappConfigDescriptor,
    webserverConfigDescriptor,
    pluginConfigDescriptor,
    mapConfigDescriptor,
    fileStorageDescriptor,
    sqlStorageDescriptor,
] as const;

/** The same descriptors, keyed by id. */
export const DESCRIPTORS_BY_ID = {
    core: coreConfigDescriptor,
    webapp: webappConfigDescriptor,
    webserver: webserverConfigDescriptor,
    plugin: pluginConfigDescriptor,
    map: mapConfigDescriptor,
    "storage-file": fileStorageDescriptor,
    "storage-sql": sqlStorageDescriptor,
} as const;

/**
 * Looks a descriptor up by id, keeping the precise type of the file it
 * describes so `parseConfigText(descriptorFor("map"), text)` gives back a value
 * with the map's own fields rather than an unhelpful union.
 */
export function descriptorFor<Id extends ConfigFileId>(id: Id): (typeof DESCRIPTORS_BY_ID)[Id] {
    return DESCRIPTORS_BY_ID[id];
}

/** Every descriptor as its erased form, for code that walks all of them. */
export const ALL_DESCRIPTORS: readonly ConfigFileDescriptor<unknown>[] = CONFIG_DESCRIPTORS as readonly ConfigFileDescriptor<unknown>[];
