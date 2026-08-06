#!/usr/bin/env bash
set -euo pipefail

# Check-first dependency bootstrap for the repository's Linux self-hosted jobs.
# Downloads stay in RUNNER_TEMP and OS packages are installed only when a concrete
# command or shared library is absent. The profile list is deliberately explicit;
# scripts/tests/self-hosted-ci-policy.test.ts guards every workflow/job mapping.

profile="${1:-}"
shift || true
dry_run=false
fake_missing=""

while (($#)); do
    case "$1" in
        --dry-run) dry_run=true ;;
        --fake-missing)
            shift
            fake_missing="${1:-}"
            ;;
        *)
            echo "bootstrap: unknown argument '$1'" >&2
            exit 2
            ;;
    esac
    shift
done

case "$profile" in
    workflow-lint|workspace|java-build|java-roundtrip|test-world|screenshots|release|pages-build|action-only) ;;
    *)
        echo "::error::unknown Linux self-hosted dependency profile '$profile'" >&2
        exit 2
        ;;
esac

declare -a required_commands=()
declare -a apt_packages=()
declare -a dnf_packages=()
declare -a pacman_packages=()

fake_has() {
    [[ ",${fake_missing}," == *",$1,"* ]]
}

command_missing() {
    fake_has "$1" && return 0
    ! command -v "$1" >/dev/null 2>&1
}

append_unique() {
    local value="$1"
    shift
    local -n destination="$1"
    local existing
    for existing in "${destination[@]:-}"; do
        [[ "$existing" == "$value" ]] && return 0
    done
    destination+=("$value")
}

require_command() {
    local command_name="$1" apt_name="$2" dnf_name="$3" pacman_name="$4"
    append_unique "$command_name" required_commands
    if command_missing "$command_name"; then
        append_unique "$apt_name" apt_packages
        append_unique "$dnf_name" dnf_packages
        append_unique "$pacman_name" pacman_packages
    fi
}

require_library() {
    local soname="$1" apt_name="$2" dnf_name="$3" pacman_name="$4"
    local present=false
    if ! fake_has "$soname" && command -v ldconfig >/dev/null 2>&1 && ldconfig -p 2>/dev/null | grep -Fq "$soname"; then
        present=true
    fi
    if [[ "$present" != true ]]; then
        append_unique "$apt_name" apt_packages
        append_unique "$dnf_name" dnf_packages
        append_unique "$pacman_name" pacman_packages
    fi
}

# setup-node/setup-java extract archives with the host's tar implementation. Git
# is also needed after checkout for full-history/tag and submodule operations.
node_action_runtime() {
    require_command tar tar tar tar
    require_command gzip gzip gzip gzip
}

case "$profile" in
    workflow-lint)
        require_command git git git git
        require_command curl curl curl curl
        require_command tar tar tar tar
        require_command gzip gzip gzip gzip
        require_command sha256sum coreutils coreutils coreutils
        require_command awk gawk gawk gawk
        require_command sed sed sed sed
        ;;
    workspace)
        require_command git git git git
        node_action_runtime
        ;;
    java-build)
        require_command git git git git
        node_action_runtime
        ;;
    java-roundtrip)
        require_command git git git git
        require_command find findutils findutils findutils
        node_action_runtime
        ;;
    test-world)
        require_command git git git git
        require_command find findutils findutils findutils
        require_command sed sed sed sed
        require_command zip zip zip zip
        node_action_runtime
        ;;
    screenshots)
        require_command git git git git
        require_command find findutils findutils findutils
        require_command pkill procps procps-ng procps-ng
        require_command unzip unzip unzip unzip
        require_command xvfb-run xvfb xorg-x11-server-Xvfb xorg-server-xvfb
        require_command xauth xauth xorg-x11-xauth xorg-xauth
        require_command ldconfig libc-bin glibc glibc
        require_library libgtk-3.so.0 libgtk-3-0t64 gtk3 gtk3
        node_action_runtime
        ;;
    release)
        require_command git git git git
        require_command curl curl curl curl
        require_command tar tar tar tar
        require_command gzip gzip gzip gzip
        require_command sha256sum coreutils coreutils coreutils
        require_command find findutils findutils findutils
        require_command awk gawk gawk gawk
        require_command grep grep grep grep
        require_command zip zip zip zip
        node_action_runtime
        ;;
    pages-build)
        require_command git git git git
        require_command curl curl curl curl
        require_command tar tar tar tar
        require_command gzip gzip gzip gzip
        require_command sha256sum coreutils coreutils coreutils
        require_command awk gawk gawk gawk
        node_action_runtime
        ;;
    action-only)
        # actions/deploy-pages runs on the runner's bundled action runtime and has
        # no repository shell command or external executable dependency.
        ;;
esac

install_system_packages() {
    if ((${#apt_packages[@]} == 0)); then
        echo "bootstrap[$profile]: required OS commands and libraries are already present"
        return
    fi

    if [[ "$dry_run" == true ]]; then
        echo "bootstrap[$profile]: DRY-RUN apt packages: ${apt_packages[*]}"
        echo "bootstrap[$profile]: DRY-RUN dnf packages: ${dnf_packages[*]}"
        echo "bootstrap[$profile]: DRY-RUN pacman packages: ${pacman_packages[*]}"
        return
    fi

    local -a elevate=()
    if [[ "$(id -u)" != 0 ]]; then
        if command -v sudo >/dev/null 2>&1 && sudo -n true >/dev/null 2>&1; then
            elevate=(sudo -n)
        else
            echo "::error::cannot install missing dependencies (${apt_packages[*]}): the runner is not root and passwordless sudo is unavailable" >&2
            exit 1
        fi
    fi

    if command -v apt-get >/dev/null 2>&1; then
        local -a resolved_apt_packages=()
        local package
        for package in "${apt_packages[@]}"; do
            if [[ "$package" == libgtk-3-0t64 ]] && ! apt-cache show libgtk-3-0t64 >/dev/null 2>&1; then
                package=libgtk-3-0
            fi
            resolved_apt_packages+=("$package")
        done
        "${elevate[@]}" env DEBIAN_FRONTEND=noninteractive apt-get update
        if ! "${elevate[@]}" env DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends "${resolved_apt_packages[@]}"; then
            echo "::error::failed to install dependencies: ${resolved_apt_packages[*]}" >&2
            exit 1
        fi
    elif command -v dnf >/dev/null 2>&1; then
        if ! "${elevate[@]}" dnf install -y "${dnf_packages[@]}"; then
            echo "::error::failed to install dependencies: ${dnf_packages[*]}" >&2
            exit 1
        fi
    elif command -v yum >/dev/null 2>&1; then
        if ! "${elevate[@]}" yum install -y "${dnf_packages[@]}"; then
            echo "::error::failed to install dependencies: ${dnf_packages[*]}" >&2
            exit 1
        fi
    elif command -v pacman >/dev/null 2>&1; then
        if ! "${elevate[@]}" pacman -Sy --noconfirm --needed "${pacman_packages[@]}"; then
            echo "::error::failed to install dependencies: ${pacman_packages[*]}" >&2
            exit 1
        fi
    else
        echo "::error::cannot install missing dependencies (${apt_packages[*]}): supported package manager not found (apt-get, dnf, yum or pacman)" >&2
        exit 1
    fi
}

install_system_packages

if [[ "$dry_run" != true ]]; then
    for command_name in "${required_commands[@]}"; do
        if ! command -v "$command_name" >/dev/null 2>&1; then
            echo "::error::dependency '$command_name' is still unavailable after package installation" >&2
            exit 1
        fi
    done
    if [[ "$profile" == screenshots ]] && ! ldconfig -p 2>/dev/null | grep -Fq 'libgtk-3.so.0'; then
        echo "::error::dependency 'libgtk-3.so.0' is still unavailable after package installation" >&2
        exit 1
    fi
fi

case "$profile" in
    workflow-lint|release|pages-build) ;;
    *)
        echo "bootstrap[$profile]: complete"
        exit 0
        ;;
esac

tool_root="${RUNNER_TEMP:-${TMPDIR:-/tmp}}/material-bluemap-tools"
mkdir -p "$tool_root"
github_path="${GITHUB_PATH:-$tool_root/github-path}"

install_pinned_tar_tool() {
    local name="$1" version="$2" url="$3" digest="$4" member="$5" version_command="$6"
    local current=""
    if ! fake_has "$name" && command -v "$name" >/dev/null 2>&1; then
        current=$(eval "$version_command" 2>/dev/null || true)
    fi
    if [[ "$current" == "$version" ]]; then
        echo "bootstrap[$profile]: $name $version already present"
        return
    fi
    if [[ "$dry_run" == true ]]; then
        echo "bootstrap[$profile]: DRY-RUN install $name $version from $url"
        return
    fi

    local install_dir="$tool_root/$name-$version" archive="$tool_root/$name-$version.tar.gz"
    rm -rf "$install_dir" "$archive"
    mkdir -p "$install_dir"
    curl -fsSL --retry 3 --retry-delay 2 -o "$archive" "$url"
    printf '%s  %s\n' "$digest" "$archive" | sha256sum --check --strict -
    tar -xzf "$archive" -C "$install_dir" "$member"
    if [[ "$install_dir/$member" != "$install_dir/$name" ]]; then
        mv "$install_dir/$member" "$install_dir/$name"
    fi
    chmod +x "$install_dir/$name"
    export PATH="$install_dir:$PATH"
    printf '%s\n' "$install_dir" >> "$github_path"
    if ! command -v "$name" >/dev/null 2>&1; then
        echo "::error::dependency '$name' was downloaded but is not executable" >&2
        exit 1
    fi
    echo "bootstrap[$profile]: installed $name $version in $install_dir"
}

case "$profile" in
    workflow-lint)
        install_pinned_tar_tool \
            shellcheck 0.11.0 \
            https://github.com/koalaman/shellcheck/releases/download/v0.11.0/shellcheck-v0.11.0.linux.x86_64.tar.gz \
            b7af85e41cc99489dcc21d66c6d5f3685138f06d34651e6d34b42ec6d54fe6f6 \
            shellcheck-v0.11.0/shellcheck \
            "shellcheck --version | awk '/^version:/ {print \$2}'"
        install_pinned_tar_tool \
            actionlint 1.7.12 \
            https://github.com/rhysd/actionlint/releases/download/v1.7.12/actionlint_1.7.12_linux_amd64.tar.gz \
            8aca8db96f1b94770f1b0d72b6dddcb1ebb8123cb3712530b08cc387b349a3d8 \
            actionlint \
            "actionlint -version | sed 's/^v//'"
        ;;
    release|pages-build)
        install_pinned_tar_tool \
            gh 2.97.0 \
            https://github.com/cli/cli/releases/download/v2.97.0/gh_2.97.0_linux_amd64.tar.gz \
            a2c9b8497e1f85b1ad0dfcb78b5a622e098801b8e461e459e88e1ee12f018112 \
            gh_2.97.0_linux_amd64/bin/gh \
            "gh --version | awk 'NR == 1 {print \$3}'"
        ;;
esac

echo "bootstrap[$profile]: complete"
