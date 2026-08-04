/**
 * `webserver.conf` — BlueMap's own HTTP server.
 *
 * Java source: `common/src/main/java/de/bluecolored/bluemap/common/config/WebserverConfig.java`
 * Template:    `common/src/main/resources/de/bluecolored/bluemap/config/webserver.conf`
 *
 * `ip` is on the Java class and nowhere in the template, so it is modelled here
 * as a hidden field. It is the only way to stop the server listening on every
 * interface, which makes it worth surfacing rather than leaving undiscoverable.
 */

import { z } from "zod";
import type { FieldMeta, GroupMeta } from "../meta.js";
import { WEBSERVER_TEMPLATE } from "../templates/sources.js";
import { ACCESS_LOG_TOKENS, hoconBoolean, hoconInt, hoconString, integerControl, LISTEN_ADDRESS_OPTIONS, SWITCH } from "./common.js";
import type { ConfigFileDescriptor } from "./descriptor.js";

export const webserverConfigSchema = z.object({
    enabled: hoconBoolean().default(true),
    webroot: hoconString().default("bluemap/web"),
    ip: hoconString().default("0.0.0.0"),
    port: hoconInt({ min: 0, max: 65535 }).default(8100),
    "sse-enabled": hoconBoolean().default(true),
    log: z
        .object({
            file: hoconString().nullable().default(null),
            append: hoconBoolean().default(false),
            format: hoconString().default('%1$s "%3$s %4$s %5$s" %6$s %7$s'),
        })
        .default({ file: null, append: false, format: '%1$s "%3$s %4$s %5$s" %6$s %7$s' }),
});

export type WebserverConfig = z.infer<typeof webserverConfigSchema>;

const GROUPS: readonly GroupMeta[] = [
    { id: "general", label: "Web server" },
    { id: "network", label: "Network" },
    { id: "logging", label: "Access log" },
];

const FIELDS: readonly FieldMeta[] = [
    {
        path: "enabled",
        key: "enabled",
        segments: ["enabled"],
        javaField: "enabled",
        label: "Run the integrated web server",
        doc: [
            "With this setting you can disable the integrated webserver.",
            "This is useful if you want to only render the map data for later use, or if you setup your own webserver.",
            "Default is true",
        ].join("\n"),
        group: "general",
        control: SWITCH,
        default: true,
        commentedOutInTemplate: false,
        hidden: false,
        invalidatesTiles: false,
        advanced: false,
    },
    {
        path: "webroot",
        key: "webroot",
        segments: ["webroot"],
        javaField: "webroot",
        label: "Web root",
        doc: [
            "The webroot that the server will host to the web.",
            "Usually this should be set to the same directory like in the webapp.conf!",
            'Default is "bluemap/web"',
        ].join("\n"),
        group: "general",
        control: { kind: "path", select: "directory", relativeToWorkingDirectory: true },
        default: "bluemap/web",
        templateValue: { value: "web", note: "The CLI passes 'web' as its default web root, so a generated webserver.conf says web rather than bluemap/web." },
        commentedOutInTemplate: false,
        hidden: false,
        invalidatesTiles: false,
        advanced: false,
    },
    {
        path: "ip",
        key: "ip",
        segments: ["ip"],
        javaField: "ip",
        label: "Listen address",
        doc: [
            "The address the webserver binds to.",
            'Not present in upstream\'s template. "0.0.0.0" and "::0" and an empty value all bind every interface, "#getLocalHost" resolves the machine\'s own host name,',
            "and anything else is resolved as a host name or literal address.",
            'Default is "0.0.0.0" (reachable from anywhere that can route to this machine).',
        ].join("\n"),
        group: "network",
        // Three of the four listed values are not addresses: "", "0.0.0.0" and "::0"
        // share one branch in resolveIp and bind the wildcard, and "#getLocalHost" is
        // a keyword. None of that is discoverable from an empty text field, and the
        // field is undocumented upstream, so the list is the only place a person will
        // meet the keyword. Free entry stays open for a real host name or address.
        control: { kind: "select", allowCustom: true, options: LISTEN_ADDRESS_OPTIONS },
        default: "0.0.0.0",
        commentedOutInTemplate: false,
        hidden: true,
        invalidatesTiles: false,
        advanced: true,
    },
    {
        path: "port",
        key: "port",
        segments: ["port"],
        javaField: "port",
        label: "Port",
        doc: ["The port that the webserver listens to.", "Default is 8100"].join("\n"),
        group: "network",
        control: integerControl({ min: 0, max: 65535, step: 1 }),
        default: 8100,
        commentedOutInTemplate: false,
        hidden: false,
        invalidatesTiles: false,
        advanced: false,
    },
    {
        path: "sse-enabled",
        key: "sse-enabled",
        segments: ["sse-enabled"],
        javaField: "sseEnabled",
        label: "Push updates with Server-Sent Events",
        doc: [
            "Whether to use Server-Sent Events (SSE) for pushing tile and marker-updates to the connected clients.",
            "Default is true",
        ].join("\n"),
        group: "network",
        control: SWITCH,
        default: true,
        commentedOutInTemplate: false,
        hidden: false,
        invalidatesTiles: false,
        advanced: false,
    },
    {
        path: "log.file",
        key: "file",
        segments: ["log", "file"],
        javaField: "log.file",
        label: "Access log file",
        doc: [
            "The file where all the webserver activity will be logged to.",
            "Comment out to disable the logging completely.",
            "Java String formatting syntax can be used to add timestamps, see: https://docs.oracle.com/javase/8/docs/api/java/util/Formatter.html",
            "Default is no logging.",
        ].join("\n"),
        group: "logging",
        control: { kind: "path", select: "file", extensions: ["log"], relativeToWorkingDirectory: true },
        default: null,
        templateValue: { value: "data/logs/webserver.log", note: "The generated file points at a log inside the data folder, so a fresh install logs by default." },
        commentedOutInTemplate: false,
        hidden: false,
        invalidatesTiles: false,
        advanced: false,
    },
    {
        path: "log.append",
        key: "append",
        segments: ["log", "append"],
        javaField: "log.append",
        label: "Append to the log file",
        doc: ["Whether the logger should append to an existing file, or overwrite it.", "Default is false (overwrite the file)."].join("\n"),
        group: "logging",
        control: SWITCH,
        default: false,
        commentedOutInTemplate: false,
        hidden: false,
        invalidatesTiles: false,
        advanced: false,
    },
    {
        path: "log.format",
        key: "format",
        segments: ["log", "format"],
        javaField: "log.format",
        label: "Access log format",
        doc: [
            "The format of the webserver acivity logs.",
            "The syntax is the Java String formatting syntax, see: https://docs.oracle.com/javase/8/docs/api/java/util/Formatter.html",
            "Possible Arguments:                                                    | Example output",
            " 1 - the source address (ignoring any xff headers).                    | 10.10.10.10",
            " 2 - the source address (using the (leftmost) xff header if provided). | 88.66.44.22",
            " 3 - the http method of the request.                                   | GET",
            " 4 - the full request address.                                         | /assets/file.png",
            " 5 - the protocol version of the request.                              | HTTP/1.1",
            " 6 - the status code of the response.                                  | 200",
            " 7 - the status message of the response.                               | OK",
            'Default is "%1$s \\"%3$s %4$s %5$s\\" %6$s %7$s"                         | 10.10.10.10 "GET /assets/file.png HTTP/1.1" 200 OK',
        ].join("\n"),
        group: "logging",
        // A java.util.Formatter template really is free text, so it stays a text
        // field. What is not free is the argument list: seven numbered placeholders,
        // each meaning one thing. Carrying them as insertable tokens makes the closed
        // half of an open field reachable without pretending the field is a select.
        control: { kind: "text", monospace: true, tokens: ACCESS_LOG_TOKENS },
        default: '%1$s "%3$s %4$s %5$s" %6$s %7$s',
        commentedOutInTemplate: false,
        hidden: false,
        invalidatesTiles: false,
        advanced: true,
    },
];

export const webserverConfigDescriptor: ConfigFileDescriptor<WebserverConfig> = {
    id: "webserver",
    title: "Web server",
    description: "The HTTP server BlueMap can run itself, for people who do not want to put the tiles behind their own.",
    location: { pattern: "webserver.conf", cardinality: "single" },
    schema: webserverConfigSchema,
    fields: FIELDS,
    groups: GROUPS,
    legacyKeys: [],
    template: WEBSERVER_TEMPLATE,
};
