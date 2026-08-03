/**
 * The seven configuration templates, copied byte for byte from upstream BlueMap.
 *
 * Source: `vendor/BlueMap/common/src/main/resources/de/bluecolored/bluemap/config/`
 *
 * These are embedded rather than read from disk because the app ships without
 * the vendored Java tree beside it. `sources.test.ts` compares every string here
 * against the vendored file byte for byte whenever that tree is present, so the
 * copies cannot quietly drift from upstream.
 *
 * The `\${...}` sequences below are BlueMap's own template variables, escaped so
 * that JavaScript leaves them alone. See `template.ts` for how they expand.
 *
 * DO NOT EDIT BY HAND. Regenerate with:
 *   node design/packages/config/scripts/sync-templates.mjs
 */

/** Upstream `core.conf`. */
export const CORE_TEMPLATE = `##                          ##
##         BlueMap          ##
##       Core-Config        ##
##                          ##

# By changing the setting (accept-download) below to TRUE you are indicating that you have accepted Mojang's EULA (https://account.mojang.com/documents/minecraft_eula),
# you confirm that you own a license to Minecraft (Java Edition),
# and you agree that BlueMap will download and use a Minecraft client file (depending on the Minecraft version) from Mojang's servers (https://piston-meta.mojang.com/) for you.
# This file contains resources that belong to Mojang and you must not redistribute it or do anything else that is not compliant with Mojang's EULA.
# BlueMap uses resources in this file to generate the 3D models used for the map and texture them. Without these, BlueMap will not work.
# \${timestamp}
accept-download: false

# The folder where BlueMap saves data files it needs during runtime.
# For example, the render progress file, which is used to resume the render across restarts.
# Default is "bluemap"
data: "\${data}"

# This changes the amount of threads that BlueMap will use to render the maps.
# A higher value can improve the render speed, but could impact performance on the host machine.
# This should be always below or equal to the number of available processor cores.
# Zero or a negative value means the amount of available processor cores subtracted by the value.
# For example, on a machine with 6 cores, a value of -2 would result in 4 render threads.
# Default is 1
render-thread-count: \${render-thread-count}

# This changes the priority that BlueMap's render-threads will get.
# How the thread-priority affects actual performance depends on your JVM.
# The priority must be a value between 1 and 10.
# Default is Javas default priority (\${default-thread-priority})
#render-thread-priority: 1

# Cooldown time in seconds for updating region-files.\${update-interval-u-flag<<
# Only when the -u flag is used.>>}
# If a region-file got updated once, the same region-file will not be updated again until this cooldown-time has passed.
# Default is 60 seconds
update-cooldown: 60

# The interval in minutes at which a full map update will be triggered.\${update-interval-u-flag<<
# Only when the -u flag is used.>>}
# This is IN ADDITION to the normal map update process (in case that fails to detect any file changes).
# ! This DOESN'T re-render the entire map each time, it only checks if there are some changes that have not been rendered yet!
# Set to 0 to disable.
# Default is 1440 (24 hours)
full-update-interval: 1440

# Controls whether BlueMap should try to find and load mod resources and datapacks from the server/world directories.
# Default is true
scan-for-mod-resources: true
\${metrics<<
# If this is true, BlueMap might send really basic metric reports containing only the implementation type and the version that is being used to https://metrics.bluecolored.de/bluemap/
# This allows me to track the basic usage of BlueMap and helps me stay motivated to further develop this tool! Please leave it on :)
# An example report looks like this: {"implementation":"\${implementation}","version":"\${version}","mcVersion":"\${mcVersion}"}
# Default is true
metrics: true
>>}
# Config-section for debug logging:
log: {
  # The file where the debug log will be written to.
  # Comment out to disable debug logging completely.
  # Java String formatting syntax can be used to add timestamps, see: https://docs.oracle.com/javase/8/docs/api/java/util/Formatter.html
  # Default is no logging.
  file: "\${logfile}"
  #file: "\${logfile-with-time}"

  # Whether the logger should append to an existing file, or overwrite it.
  # Default is false (overwrite the file).
  append: false
}
`;

/** Upstream `webapp.conf`. */
export const WEBAPP_TEMPLATE = `##                          ##
##         BlueMap          ##
##      Webapp-Config       ##
##                          ##

# With this setting you can disable the creation and updating of all webapp related files.
# Default is true
enabled: true

# The webroot where the webapp files will be created.
# Usually this should be set to the same directory like in the webserver.conf!
# Default is "bluemap/web"
webroot: "\${webroot}"

# Whether the settings.json of the webapp should be updated/synchronized with the current BlueMap settings.
# If this is set to "false", BlueMap will only add maps to the settings.json but never remove unknown ones or update other settings.
# Disabling this is for example useful if you are running multiple BlueMap instances on the same webroot and don't want them to overwrite each others maps.
# Default is true
update-settings-file: true

# If the webapp should use cookies to save the configurations of a user.
# Default is true
use-cookies: true

# If the webapp will default to flat-view instead of perspective-view.
# Default is false (perspective-view)
default-to-flat-view: false

# The default map and camera location where a user will start after opening the webapp.
# This is in form of the URL anchor: Open your map in a browser and look at the URL, everything after the '#' is the value for this setting.
# Default is "no anchor" (The camera will start with the topmost map and at that map's starting point).
#start-location: "world:0:16:-32:390:0.1:0.19:0:0:perspective"

# The minimum (closest) and maximum (furthest) distance (in blocks) that the camera can be from the ground.
# Default is min:5 max:100000
min-zoom-distance: 5
max-zoom-distance: 100000

# The default value of the resolution (settings menu).
# Possible values are: 0.5, 1, 2
# Default is 1
resolution-default: 1

# The min, max and default values of the hires render distance slider (settings menu).
# The values are in blocks.
# Default is max:500 default:100 and min:0
hires-slider-max: 500
hires-slider-default: 100
hires-slider-min: 0

# The min, max and default values of the lowres render distance slider (settings menu).
# The values are in blocks.
# Default is max:7000 default:2000 and min:500
lowres-slider-max: 7000
lowres-slider-default: 2000
lowres-slider-min: 500

# Here you can specify an alternative base URL where all of the map data is loaded from.
# Default is "maps"
#map-data-root: "https://cdn.my-domain.com/mapdata"

# Here you can specify an alternative base URL where all of the live data is loaded from.
# Default is "maps"
#live-data-root: "https://cdn.my-domain.com/livedata"

# Here you can add URLs to custom scripts (js) so they will be loaded by the webapp.
# You can place them somewhere in BlueMap's webroot and add the (relative) link here.
scripts: [
  #"js/my-custom-script.js"
]

# Here you can add URLs to custom styles (css) so they will be loaded by the webapp.
# You can place them somewhere in BlueMap's webroot and add the (relative) link here.
styles: [
  #"css/my-custom-style.css"
]
`;

/** Upstream `webserver.conf`. */
export const WEBSERVER_TEMPLATE = `##                          ##
##         BlueMap          ##
##     Webserver-Config     ##
##                          ##

# With this setting you can disable the integrated webserver.
# This is useful if you want to only render the map data for later use, or if you setup your own webserver.
# Default is true
enabled: true

# The webroot that the server will host to the web.
# Usually this should be set to the same directory like in the webapp.conf!
# Default is "bluemap/web"
webroot: "\${webroot}"

# The port that the webserver listens to.
# Default is 8100
port: 8100

# Whether to use Server-Sent Events (SSE) for pushing tile and marker-updates to the connected clients.
# Default is true
sse-enabled: true

# Config-section for webserver activity logging:
log: {
  # The file where all the webserver activity will be logged to.
  # Comment out to disable the logging completely.
  # Java String formatting syntax can be used to add timestamps, see: https://docs.oracle.com/javase/8/docs/api/java/util/Formatter.html
  # Default is no logging.
  file: "\${logfile}"
  #file: "\${logfile-with-time}"

  # Whether the logger should append to an existing file, or overwrite it.
  # Default is false (overwrite the file).
  append: false

  # The format of the webserver acivity logs.
  # The syntax is the Java String formatting syntax, see: https://docs.oracle.com/javase/8/docs/api/java/util/Formatter.html
  # Possible Arguments:                                                    | Example output
  #  1 - the source address (ignoring any xff headers).                    | 10.10.10.10
  #  2 - the source address (using the (leftmost) xff header if provided). | 88.66.44.22
  #  3 - the http method of the request.                                   | GET
  #  4 - the full request address.                                         | /assets/file.png 
  #  5 - the protocol version of the request.                              | HTTP/1.1
  #  6 - the status code of the response.                                  | 200
  #  7 - the status message of the response.                               | OK
  # Default is "%1$s \\"%3$s %4$s %5$s\\" %6$s %7$s"                         | 10.10.10.10 "GET /assets/file.png HTTP/1.1" 200 OK
  format: "%1$s \\"%3$s %4$s %5$s\\" %6$s %7$s"
}
`;

/** Upstream `plugin.conf`. */
export const PLUGIN_TEMPLATE = `##                          ##
##         BlueMap          ##
##      Plugin-Config       ##
##                          ##

# If the server should send player positions to the webapp.
# This only works if the integrated webserver is enabled.
# Default is true
live-player-markers: true

# A list of gamemodes that will prevent a player from appearing on the map.
# Possible values are: survival, creative, spectator or adventure.
hidden-game-modes: [
  "spectator"
]

# If this is true, players that are vanished (by a plugin) will be hidden on the map.
# (This only works with Spigot and Sponge based vanish plugins).
# Default is true
hide-vanished: true

# If this is true, players that have an invisibility (potion-)effect will be hidden on the map.
# Default is true
hide-invisible: true

# If this is true, players that are sneaking will be hidden on the map.
# Default is false
hide-sneaking: false

# Hides the player if they are in a sky (or block) light level below the given number.
# BOTH values have to be below the threshold for the player to be hidden!
# E.g. if you set both to 1, then the player will be hidden on the map if they are in absolute darkness.
# Or, if you want players only be visible on the surface, then set the sky threshold to something between
# 1 and 15 and the block threshold to 16.
# Default is 0 (don't hide the player).
hide-below-sky-light: 0
hide-below-block-light: 0

# If this is true, players that are on a different world than the viewed map will not appear on the player list.
# Default is false
hide-different-world: false

# The interval in seconds at which the markers will be written to the map storage.
# This is useful if you can't create a live connection between the server and the webapp
# and the markers can only be updated via the map storage.
# 0 or lower means that the markers will never be written to the map storage.
# Default is 0
#write-markers-interval: 10

# The interval in seconds at which the players will be written to the map storage.
# This is useful if you can't create a live connection between the server and the webapp
# and the players can only be updated via the map storage.
# 0 or lower means that the players will never be written to the map storage.
# Default is 0
#write-players-interval: 3

# Download the skin from mojang servers when a player joins your server, so it can be used for the player markers.
# Default is true
skin-download: true

# The amount of players that is needed to pause BlueMap's render threads.
# If this amount of players or more is online, BlueMap will stop rendering map updates until enough players have logged off again.
# Setting this to 0 or -1 will disable this feature, which means BlueMap will not pause rendering.
# Default is -1
player-render-limit: -1
`;

/** Upstream `maps/map.conf`. */
export const MAP_TEMPLATE = `##                          ##
##         BlueMap          ##
##        Map-Config        ##
##                          ##

# The path to the save folder of the world to render.
# If this is not defined (commented out or removed), the map will be only registered to the webserver and the webapp
# but not rendered or loaded by BlueMap. This can be used to display a map that has been rendered somewhere else.
world: "\${world}"

# The dimension of the world. Can be "minecraft:overworld", "minecraft:the_nether", "minecraft:the_end",
# or any dimension key introduced by a mod or datapack.
dimension: "\${dimension}"
\${display-dimension-type<<
# The dimension-type of the world. Can be "minecraft:overworld", "minecraft:the_nether", "minecraft:the_end", "minecraft:overworld_caves",
# or any dimension-type key introduced by a datapack.
# Setting this value is usually not needed! In most cases BlueMap can detect this value automatically from the world-files.
# Default is the detected dimension-type
dimension-type: "\${dimension-type}"
>>}
# The display name of this map (how this map will be named on the webapp).
# You can change this at any time.
# Default is the id of this map
name: "\${name}"

# A lower value makes the map appear first (in lists and menus), a higher value makes it appear later.
# The value needs to be an integer but it can be negative.
# You can change this at any time.
# Default is 0
sorting: \${sorting}

# The position in the world where the map will be centered on when you open it.
# You can change this at any time.
# Default is { x: 0, z: 0 }
start-pos: { x: 0, z: 0 }

# The color of the sky as a hex-color.
# You can change this at any time.
# Default is "#7dabff"
sky-color: "\${sky-color}"

# The color of the void as a hex-color.
# You can change this at any time.
# Default is "#000000"
void-color: "\${void-color}"

# Defines the initial sky light strength the map will be set to when it is opened.
# 0 is no sky light, 1 is fully lit up.
# You can change this at any time.
# Default is 1
sky-light: 1

# Defines the ambient light strength that every block is receiving, regardless of the sunlight/blocklight.
# 0 is no ambient light, 1 is fully lit up.
# You can change this at any time.
# Default is 0
ambient-light: \${ambient-light}

# BlueMap tries to omit all blocks that are below this Y-level and are not visible from above ground.
# More specifically, block faces that have a sunlight/skylight value of 0 are removed.
# This improves the performance of the map on slower devices by a lot, but might cause some blocks to disappear that should normally be visible.
# Changing this value requires a re-render of the map.
# Set to a very high value to remove caves everywhere (e.g. 10000).
# Set to a very low value to remove nothing and render all caves (e.g. -10000).
# Default is 55 (slightly below water-level).
remove-caves-below-y: \${remove-caves-below-y}

# This is the amount of blocks relative to the "ocean floor" heightmap that the cave detection will start at.
# Everything above that (heightmap relative) y-level will not be removed.
# Comment or set to a very high value to disable using the ocean floor heightmap for cave detection.
# Changing this value requires a re-render of the map.
# Defaults to 10000 (disabled).
cave-detection-ocean-floor: -5

# With this value set to true, BlueMap also uses the block light value (additionally to the sky light) to "detect caves"
# (see the option above: remove-caves-below-y).
# Changing this value requires a re-render of the map.
# Default is false
cave-detection-uses-block-light: false

# The minimum "inhabitedTime" value that a chunk must have to be rendered.
# The "inhabitedTime" value of a chunk refers to the cumulative number of ticks players have been near this chunk.
# If you set this to a value greater than 0, BlueMap will only render chunks that players have visited already.
# Default is 0 (all generated chunks).
min-inhabited-time: 0

# With the render-mask you can limit the map render.
# This can be used to render only a certain part of a world or ignore the Nether's ceiling.
# If you change the render-mask, BlueMap automatically tries to update the map,
# including deleting map tiles which are outside the new limits.
# You can use "/bluemap fix-edges <map>" to fix any remaining issues.
#
# Please check out the wiki for more detailed information on how to configure this:
# https://bluemap.bluecolored.de/wiki/customization/Masks.html
#
# Default is no mask, BlueMap will render everything that exists.
render-mask: [
  {
    #min-x: -4000
    #max-x: 4000
    #min-z: -4000
    #max-z: 4000
    #min-y: 50
    #max-y: 100
  }\${remove-nether-ceiling<<
  {
    # This removes everything at and between y 90 and 127 (the Nether's ceiling).
    # Structures above the bedrock ceiling remain visible.
    subtract: true
    min-y: 90
    max-y: 127
  }>>}
]

# Using this, BlueMap pretends that every Block outside of the defined render-mask is AIR,
# this means you can see the blocks where the world is cut (instead of having a see-through/xray view).
# This only has an effect if you set some render-mask above.
# Changing this value requires a re-render of the map.
# Default is true
render-edges: true

# The sun-light strength that blocks at map edges will receive if render-edges is enabled.
# Should be a value between 0 and 15.
# Default is 15
edge-light-strength: 8

# Whether the perspective view will be enabled for this map.
# Changing this to true requires a re-render of the map, only if the hires-layer is enabled and free-flight view is disabled.
# Default is true
enable-perspective-view: true

# Whether the flat (isometric, top-down) view will be enabled for this map.
# Having only flat-view enabled while disabling free-flight and perspective will speed up the render and reduce the maps storage size.
# Default is true
enable-flat-view: true

# Whether the free-flight view will be enabled for this map.
# Changing this to true requires a re-render of the map, only if the hires-layer is enabled and perspective view is disabled.
# Default is true
enable-free-flight-view: true

# Whether the hires-layer will be enabled.
# Disabling this will speed up rendering and reduce the size of the map files a lot.
# But you will not be able to see the full 3D models if you zoom in on the map.
# Changing this to false will not remove any existing tiles, existing tiles just won't get updated anymore.
# Changing this to true will require a re-render of the map.
# Default is true
enable-hires: true

# This defines the storage-config that will be used to save this map.
# You can find your storage configs next to this config file in the 'storages'-folder.
# Changing this value requires a re-render of the map. The map in the old storage will not be deleted.
# Default is "file"
storage: "file"

# Normally BlueMap detects if a chunk has not yet generated its light data and omits rendering those chunks.
# If this is set to true BlueMap will render Chunks even if there is no light data!
# This can be useful for example if some mod prevents light data from being saved correctly.
# However, this also has a few drawbacks:
#  - Cave rendering will always be enabled (BlueMap is using the sky light data to detect "caves").
#  - Everything will be rendered fully lit (sky light value of 15, looks similar to having night vision).
#  - Night mode might not work correctly.
# Default is false (wait for light data).
ignore-missing-light-data: false

# Here you can define any static marker-sets with markers that should be displayed on the map.
# You can change this at any time.
# If you need dynamic markers, you can use any plugin that integrates with BlueMap's API.
# Here is a list: https://bluemap.bluecolored.de/community/3rdPartySupport.html
marker-sets: {

  # Please check out the wiki for information on how to configure this:
  # https://bluemap.bluecolored.de/wiki/customization/Markers.html

}
`;

/** Upstream `storages/file.conf`. */
export const FILE_STORAGE_TEMPLATE = `##                          ##
##         BlueMap          ##
##      Storage-Config      ##
##                          ##

# The storage-type of this storage.
# Depending on this setting, different config entries are allowed/expected in this config file.
# Don't change this value! If you want a different storage-type, check out the other example configs.
storage-type: file

# The path to the folder on your file system where BlueMap will save the rendered map.
# The default is: "bluemap/web/maps"
root: "\${root}"

# The compression type that BlueMap will use to compress generated map data.
# Available compression types are:
#  - gzip
#  - zstd
#  - deflate
#  - none
# The default is: gzip
compression: gzip
`;

/** Upstream `storages/sql.conf`. */
export const SQL_STORAGE_TEMPLATE = `##                          ##
##         BlueMap          ##
##      Storage-Config      ##
##                          ##

# The storage-type of this storage.
# Depending on this setting, different config entries are allowed/expected in this config file.
# Don't change this value! If you want a different storage-type, check out the other example configs.
storage-type: sql

# The JDBC-Connection URL that is used to connect to the database.
# The format for this URL is usually something like: jdbc:[driver]://[host]:[port]/[database]
# The exact format of the URL is determined by the JDBC-Driver you are using.
connection-url: "jdbc:mysql://localhost:3306/bluemap?permitMysqlScheme"

# You can set any additional (JDBC-Driver specific) properties here.
# Usually that's your database user and password.
connection-properties: {
  user: "root",
  password: ""
}

# The maximum number of connections to the database that are allowed to be open at the same time.
# A negative number means unlimited.
# Default is: -1
max-connections: -1

# This can be used to load a custom JDBC-Driver from a .jar file.
# E.g. if your runtime environment is not already providing the SQL-Driver you need,
# you could download the MariaDB JDBC-Connector from https://mariadb.com/downloads/connectors/connectors-data-access/java8-connector/
# If you set this value, you HAVE TO set the correct driver-class name below.
# Place it in the './bluemap' folder and use it like this:
#driver-jar: "bluemap/mariadb-java-client-3.0.7.jar"

# This is the driver-class that BlueMap will try to load and use.
# Check the documentation of the driver you are using if you don't know this.
# Leaving this commented out means that BlueMap automatically tries to find a suitable driver in your classpath.
# If you added a custom driver-jar value above, you HAVE TO set the correct class name here.
#driver-class: "org.mariadb.jdbc.Driver"

# The compression type that BlueMap will use to compress generated map data.
# Available compression types are:
#  - gzip
#  - zstd
#  - deflate
#  - none
# The default is: gzip
compression: gzip
`;

/** Every template, keyed by the config name BlueMap resolves it with. */
export const CONFIG_TEMPLATES = {
    "core": CORE_TEMPLATE,
    "webapp": WEBAPP_TEMPLATE,
    "webserver": WEBSERVER_TEMPLATE,
    "plugin": PLUGIN_TEMPLATE,
    "maps/map": MAP_TEMPLATE,
    "storages/file": FILE_STORAGE_TEMPLATE,
    "storages/sql": SQL_STORAGE_TEMPLATE,
} as const;

/** The config names BlueMap ships a template for. */
export type ConfigTemplateName = keyof typeof CONFIG_TEMPLATES;
