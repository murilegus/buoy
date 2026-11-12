import '@girs/gnome-shell/ambient';
import '@girs/gnome-shell/extensions/global';

import type St from '@girs/st-18';
import type {Calendar} from '@girs/gnome-shell/ui/calendar';

// Types only, for `pnpm check` (tsc, checkJs); nothing here exists at runtime.
// typelibs.d.ts types the gi:// modules @girs has no package for.

// Shell internals Buoy reads (gnome-shell gnome-50, js/ui/*.js); @girs types only part
// of each class. Each member is cited to where Shell sets it.
declare module '@girs/gnome-shell/ui/panel' {
    interface Panel {
        _leftBox: St.BoxLayout;     // panel.js Panel._init
        _rightBox: St.BoxLayout;    // panel.js Panel._init
    }
}

declare module '@girs/gnome-shell/ui/dateMenu' {
    interface DateMenuButton {
        _calendar: Calendar & {_weekStart: number};  // dateMenu.js DateMenuButton._init; calendar.js Calendar._init
        // dateMenu.js DateMenuButton._setEventSource; @girs does not export EventSourceBase
        _eventSource: Parameters<Calendar['setEventSource']>[0] | null;
        _weatherItem: St.Button & {_weatherClient: any};  // dateMenu.js DateMenuButton._init, WeatherSection
    }
}

declare module '@girs/gnome-shell/ui/workspace' {
    interface WorkspaceBackground {
        _updateBorderRadius(): void;        // workspace.js WorkspaceBackground
        _updateRoundedClipBounds(): void;   // workspace.js WorkspaceBackground
    }
}

declare module '@girs/gnome-shell/ui/switcherPopup' {
    interface SwitcherPopup {
        _items: St.Widget[];        // switcherPopup.js SwitcherPopup._init
    }
}

declare module '@girs/gnome-shell/ui/status/keyboard' {
    // keyboard.js getInputSourceManager: the manager singleton
    export function getInputSourceManager(): any;
}
