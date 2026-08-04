/**
 * `storages/<id>.conf` — where a map's rendered tiles are written.
 *
 * BlueMap loads one of these twice: first as the abstract base class, to read
 * `storage-type`, then again as whichever concrete class that key names. The two
 * descriptors below are those two concrete classes.
 *
 * One upstream quirk is worth knowing before editing a storage file by hand: the
 * `storageType` field is declared on the abstract base with a default of
 * `bluemap:file`, and `SQLConfig` inherits that default. An SQL storage config
 * that omits `storage-type` is therefore loaded as a *file* storage. The
 * template always writes the key, and so does this package.
 *
 * Java source: `common/src/main/java/de/bluecolored/bluemap/common/config/storage/`
 */

import { z } from "zod";
import type { FieldMeta, GroupMeta } from "../meta.js";
import { FILE_STORAGE_TEMPLATE, SQL_STORAGE_TEMPLATE } from "../templates/sources.js";
import {
    BLUEMAP_NAMESPACE,
    COMPRESSION_OPTIONS,
    formatKey,
    hoconBoolean,
    hoconInt,
    hoconString,
    integerControl,
    namespacedKey,
    SQL_DIALECT_OPTIONS,
    STORAGE_TYPE_OPTIONS,
    SWITCH,
} from "./common.js";
import type { ConfigFileDescriptor } from "./descriptor.js";

const STORAGE_TYPE_DOC = [
    "The storage-type of this storage.",
    "Depending on this setting, different config entries are allowed/expected in this config file.",
    "Don't change this value! If you want a different storage-type, check out the other example configs.",
].join("\n");

const COMPRESSION_DOC = [
    "The compression type that BlueMap will use to compress generated map data.",
    "Available compression types are:",
    " - gzip",
    " - zstd",
    " - deflate",
    " - none",
    "The default is: gzip",
].join("\n");

function storageTypeField(defaultNote: string): FieldMeta {
    return {
        path: "storage-type",
        key: "storage-type",
        segments: ["storage-type"],
        javaField: "storageType",
        label: "Storage type",
        doc: `${STORAGE_TYPE_DOC}\n${defaultNote}`,
        group: "type",
        // The registry is closed, but the *spelling* is not: the Java default is
        // `bluemap:file` and upstream's template writes a bare `file`, and
        // `StorageConfig.parseKey` additionally retries a lower-cased key for old
        // files. A closed select over the short spellings therefore showed an empty
        // control for the Java default, which is the very value a fresh install has.
        // The namespace makes both spellings match the same option; free entry keeps
        // whatever third spelling an existing file happens to use.
        control: { kind: "select", allowCustom: true, options: STORAGE_TYPE_OPTIONS, keyNamespace: BLUEMAP_NAMESPACE },
        default: "bluemap:file",
        commentedOutInTemplate: false,
        hidden: false,
        invalidatesTiles: true,
        invalidationNote: "The tiles live in the storage. Changing the type points the map at a different one, which starts out empty.",
        advanced: false,
    };
}

function compressionField(): FieldMeta {
    return {
        path: "compression",
        key: "compression",
        segments: ["compression"],
        javaField: "compression",
        label: "Compression",
        doc: COMPRESSION_DOC,
        group: "data",
        control: { kind: "select", allowCustom: true, options: COMPRESSION_OPTIONS, keyNamespace: BLUEMAP_NAMESPACE },
        default: "bluemap:gzip",
        templateValue: { value: "gzip", note: "The template writes the key unqualified. BlueMap reads it with the bluemap namespace, so gzip and bluemap:gzip are the same value." },
        commentedOutInTemplate: false,
        hidden: false,
        invalidatesTiles: true,
        invalidationNote:
            "Not stated upstream. Every tile file carries the compression it was written with in its name, so tiles written under the old setting are not found under the new one.",
        advanced: false,
    };
}

// ---- file storage ----------------------------------------------------------

export const fileStorageConfigSchema = z.object({
    "storage-type": namespacedKey().default("bluemap:file"),
    root: hoconString().default("bluemap/web/maps"),
    compression: namespacedKey().default("bluemap:gzip"),
    atomic: hoconBoolean().default(true),
});

export type FileStorageConfig = z.infer<typeof fileStorageConfigSchema>;

const FILE_GROUPS: readonly GroupMeta[] = [
    { id: "type", label: "Storage type" },
    { id: "location", label: "Location" },
    { id: "data", label: "Data" },
];

const FILE_FIELDS: readonly FieldMeta[] = [
    storageTypeField('The Java default is "bluemap:file", which is also what this file is.'),
    {
        path: "root",
        key: "root",
        segments: ["root"],
        javaField: "root",
        label: "Map folder",
        doc: ["The path to the folder on your file system where BlueMap will save the rendered map.", 'The default is: "bluemap/web/maps"'].join("\n"),
        group: "location",
        control: { kind: "path", select: "directory", relativeToWorkingDirectory: true },
        default: "bluemap/web/maps",
        templateValue: { value: "web/maps", note: "The CLI passes 'web' as its default web root, so a generated file.conf says web/maps." },
        commentedOutInTemplate: false,
        hidden: false,
        invalidatesTiles: true,
        invalidationNote: "The tiles are in the old folder. Pointing the map somewhere else does not move them.",
        advanced: false,
    },
    compressionField(),
    {
        path: "atomic",
        key: "atomic",
        segments: ["atomic"],
        javaField: "atomic",
        label: "Write tiles atomically",
        doc: [
            "Whether a tile is written to a temporary file and then moved into place, so a reader never sees a half-written tile.",
            "Not present in upstream's template. Defaults to true.",
            "Turning it off avoids the extra rename on file systems where that is expensive, at the cost of a viewer occasionally reading a partial tile.",
        ].join("\n"),
        group: "data",
        control: SWITCH,
        default: true,
        commentedOutInTemplate: false,
        hidden: true,
        invalidatesTiles: false,
        advanced: true,
    },
];

export const fileStorageDescriptor: ConfigFileDescriptor<FileStorageConfig> = {
    id: "storage-file",
    title: "File storage",
    description: "Rendered tiles written to a folder on disk. This is what a fresh install uses.",
    location: { pattern: "storages/<id>.conf", cardinality: "many", folder: "storages" },
    schema: fileStorageConfigSchema,
    fields: FILE_FIELDS,
    groups: FILE_GROUPS,
    legacyKeys: [],
    template: FILE_STORAGE_TEMPLATE,
};

// ---- SQL storage -----------------------------------------------------------

export const sqlStorageConfigSchema = z.object({
    "storage-type": namespacedKey().default("bluemap:file"),
    "connection-url": hoconString().default("jdbc:mysql://localhost/bluemap?permitMysqlScheme"),
    "connection-properties": z.record(z.string(), hoconString()).default({}),
    dialect: namespacedKey().nullable().default(null),
    "driver-jar": hoconString().nullable().default(null),
    "driver-class": hoconString().nullable().default(null),
    "max-connections": hoconInt().default(-1),
    compression: namespacedKey().default("bluemap:gzip"),
});

export type SqlStorageConfig = z.infer<typeof sqlStorageConfigSchema>;

const SQL_GROUPS: readonly GroupMeta[] = [
    { id: "type", label: "Storage type" },
    { id: "connection", label: "Connection" },
    { id: "driver", label: "JDBC driver" },
    { id: "data", label: "Data" },
];

const SQL_FIELDS: readonly FieldMeta[] = [
    storageTypeField(
        'The Java default is "bluemap:file", inherited from the abstract base class, so an SQL storage config that leaves this key out is loaded as a file storage. Always write it.',
    ),
    {
        path: "connection-url",
        key: "connection-url",
        segments: ["connection-url"],
        javaField: "connectionUrl",
        label: "JDBC connection URL",
        doc: [
            "The JDBC-Connection URL that is used to connect to the database.",
            "The format for this URL is usually something like: jdbc:[driver]://[host]:[port]/[database]",
            "The exact format of the URL is determined by the JDBC-Driver you are using.",
        ].join("\n"),
        group: "connection",
        control: { kind: "text", monospace: true, placeholder: "jdbc:mysql://localhost:3306/bluemap?permitMysqlScheme" },
        default: "jdbc:mysql://localhost/bluemap?permitMysqlScheme",
        templateValue: {
            value: "jdbc:mysql://localhost:3306/bluemap?permitMysqlScheme",
            note: "The template names the port explicitly; the Java default leaves it out. Both reach the same server on a default MySQL install.",
        },
        commentedOutInTemplate: false,
        hidden: false,
        invalidatesTiles: true,
        invalidationNote: "The tiles are in the old database. Pointing the map at another one does not copy them.",
        advanced: false,
    },
    {
        path: "connection-properties",
        key: "connection-properties",
        segments: ["connection-properties"],
        javaField: "connectionProperties",
        label: "Connection properties",
        doc: ["You can set any additional (JDBC-Driver specific) properties here.", "Usually that's your database user and password."].join("\n"),
        group: "connection",
        control: { kind: "key-value", keyLabel: "Property", valueLabel: "Value", secretKeys: ["password", "passwd", "pwd"] },
        default: {},
        templateValue: { value: { user: "root", password: "" }, note: "The template pre-fills user and an empty password; the Java field starts empty." },
        commentedOutInTemplate: false,
        hidden: false,
        invalidatesTiles: false,
        advanced: false,
        secret: true,
    },
    {
        path: "dialect",
        key: "dialect",
        segments: ["dialect"],
        javaField: "dialect",
        label: "SQL dialect",
        doc: [
            "Which set of SQL statements BlueMap uses.",
            "Not present in upstream's template. Left unset, BlueMap picks the dialect whose protocol prefix matches the connection URL, and refuses to start if none does.",
            "Set it explicitly when the URL comes from a driver whose prefix BlueMap does not recognise.",
        ].join("\n"),
        group: "connection",
        control: { kind: "select", allowCustom: true, options: SQL_DIALECT_OPTIONS, keyNamespace: BLUEMAP_NAMESPACE },
        default: null,
        commentedOutInTemplate: false,
        hidden: true,
        invalidatesTiles: false,
        advanced: true,
    },
    {
        path: "driver-jar",
        key: "driver-jar",
        segments: ["driver-jar"],
        javaField: "driverJar",
        label: "Driver jar",
        doc: [
            "This can be used to load a custom JDBC-Driver from a .jar file.",
            "E.g. if your runtime environment is not already providing the SQL-Driver you need,",
            "you could download the MariaDB JDBC-Connector from https://mariadb.com/downloads/connectors/connectors-data-access/java8-connector/",
            "If you set this value, you HAVE TO set the correct driver-class name below.",
            "Place it in the './bluemap' folder and use it like this:",
            'driver-jar: "bluemap/mariadb-java-client-3.0.7.jar"',
        ].join("\n"),
        group: "driver",
        control: { kind: "path", select: "file", extensions: ["jar"], relativeToWorkingDirectory: true },
        default: null,
        commentedOutInTemplate: true,
        hidden: false,
        invalidatesTiles: false,
        advanced: true,
    },
    {
        path: "driver-class",
        key: "driver-class",
        segments: ["driver-class"],
        javaField: "driverClass",
        label: "Driver class",
        doc: [
            "This is the driver-class that BlueMap will try to load and use.",
            "Check the documentation of the driver you are using if you don't know this.",
            "Leaving this commented out means that BlueMap automatically tries to find a suitable driver in your classpath.",
            "If you added a custom driver-jar value above, you HAVE TO set the correct class name here.",
        ].join("\n"),
        group: "driver",
        control: { kind: "text", monospace: true, placeholder: "org.mariadb.jdbc.Driver" },
        default: null,
        commentedOutInTemplate: true,
        hidden: false,
        invalidatesTiles: false,
        advanced: true,
    },
    {
        path: "max-connections",
        key: "max-connections",
        segments: ["max-connections"],
        javaField: "maxConnections",
        label: "Maximum connections",
        doc: [
            "The maximum number of connections to the database that are allowed to be open at the same time.",
            "A negative number means unlimited.",
            "Default is: -1",
        ].join("\n"),
        group: "connection",
        control: integerControl({ step: 1, unit: "connections" }),
        default: -1,
        commentedOutInTemplate: false,
        hidden: false,
        invalidatesTiles: false,
        advanced: false,
    },
    compressionField(),
];

export const sqlStorageDescriptor: ConfigFileDescriptor<SqlStorageConfig> = {
    id: "storage-sql",
    title: "SQL storage",
    description: "Rendered tiles written to a database over JDBC, for setups that serve the map from something other than a folder.",
    location: { pattern: "storages/<id>.conf", cardinality: "many", folder: "storages" },
    schema: sqlStorageConfigSchema,
    fields: SQL_FIELDS,
    groups: SQL_GROUPS,
    legacyKeys: [],
    template: SQL_STORAGE_TEMPLATE,
};

/** Picks the descriptor for a storage file from its `storage-type` key. */
export function storageDescriptorFor(storageType: string): ConfigFileDescriptor<FileStorageConfig> | ConfigFileDescriptor<SqlStorageConfig> | undefined {
    switch (formatKey(storageType, "bluemap")) {
        case "bluemap:file":
            return fileStorageDescriptor;
        case "bluemap:sql":
            return sqlStorageDescriptor;
        default:
            return undefined;
    }
}
