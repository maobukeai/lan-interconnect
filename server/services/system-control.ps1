param(
    [string]$Action,
    [double]$Volume = -1,
    [string]$Mute = '',
    [int]$Display = 0,
    [int]$Quality = 60,
    [double]$Scale = 0.6,
    [string]$OutPath = '',
    [int]$MouseX = 0,
    [int]$MouseY = 0,
    [string]$MouseButton = 'left',
    [int]$Seconds = 0,
    [int]$Fps = 10,
    [string]$KeyName = '',
    [string]$Text = '',
    [int]$Delta = 0,
    [string]$Modifiers = ''
)

Add-Type -TypeDefinition @'
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;
using System.Windows.Forms;

namespace LanDiskSystem {
    [Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IAudioEndpointVolume {
        int RegisterControlChangeNotify(IntPtr pNotify);
        int UnregisterControlChangeNotify(IntPtr pNotify);
        int GetChannelCount(out uint pnChannelCount);
        int SetMasterVolumeLevel(float fLevelDB, IntPtr pguidEventContext);
        int SetMasterVolumeLevelScalar(float fLevel, IntPtr pguidEventContext);
        int GetMasterVolumeLevel(out float pfLevelDB);
        int GetMasterVolumeLevelScalar(out float pfLevel);
        int SetChannelVolumeLevel(uint nChannel, float fLevelDB, IntPtr pguidEventContext);
        int SetChannelVolumeLevelScalar(uint nChannel, float fLevel, IntPtr pguidEventContext);
        int GetChannelVolumeLevel(uint nChannel, out float pfLevelDB);
        int GetChannelVolumeLevelScalar(uint nChannel, out float pfLevel);
        int SetMute([MarshalAs(UnmanagedType.Bool)] bool bMute, IntPtr pguidEventContext);
        int GetMute(out bool pbMute);
        int GetVolumeStepInfo(out uint pnStep, out uint pnStepCount);
        int VolumeStepUp(IntPtr pguidEventContext);
        int VolumeStepDown(IntPtr pguidEventContext);
        int QueryHardwareSupport(out uint pdwHardwareSupportMask);
        int GetVolumeRange(out float pflVolumeMindB, out float pflVolumeMaxdB, out float pflVolumeIncrementdB);
    }

    [Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IMMDevice {
        int Activate(ref Guid id, int clsCtx, IntPtr activationParams, out IAudioEndpointVolume aev);
        int OpenPropertyStore(int stgmAccess, out IntPtr ppProperties);
        int GetId(out IntPtr ppstrId);
        int GetState(out int pdwState);
    }

    [Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IMMDeviceEnumerator {
        int EnumAudioEndpoints(int dataFlow, int stateMask, out IntPtr devices);
        int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice ppDevice);
        int GetDevice(string pwstrId, out IMMDevice ppDevice);
        int RegisterEndpointNotificationCallback(IntPtr pClient);
        int UnregisterEndpointNotificationCallback(IntPtr pClient);
    }

    [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
    public class MMDeviceEnumeratorComObject { }

    public class Core {
        [DllImport("user32.dll")]
        public static extern bool SetCursorPos(int X, int Y);

        [DllImport("user32.dll")]
        public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, int dwExtraInfo);

        [DllImport("user32.dll")]
        public static extern IntPtr GetDesktopWindow();

        [DllImport("user32.dll")]
        public static extern IntPtr GetWindowDC(IntPtr hWnd);

        [DllImport("user32.dll")]
        public static extern IntPtr ReleaseDC(IntPtr hWnd, IntPtr hDC);

        [DllImport("gdi32.dll")]
        public static extern bool BitBlt(IntPtr hObject, int nXDest, int nYDest, int nWidth, int nHeight, IntPtr hObjectSource, int nXSrc, int nYSrc, int dwRop);

        [DllImport("gdi32.dll")]
        public static extern IntPtr CreateCompatibleBitmap(IntPtr hDC, int nWidth, int nHeight);

        [DllImport("gdi32.dll")]
        public static extern IntPtr CreateCompatibleDC(IntPtr hDC);

        [DllImport("gdi32.dll")]
        public static extern bool DeleteDC(IntPtr hDC);

        [DllImport("gdi32.dll")]
        public static extern bool DeleteObject(IntPtr hObject);

        [DllImport("gdi32.dll")]
        public static extern IntPtr SelectObject(IntPtr hDC, IntPtr hObject);

        public const int SRCCOPY = 0x00CC0020;
        public const uint MOUSEEVENTF_LEFTDOWN = 0x0002;
        public const uint MOUSEEVENTF_LEFTUP = 0x0004;
        public const uint MOUSEEVENTF_RIGHTDOWN = 0x0008;
        public const uint MOUSEEVENTF_RIGHTUP = 0x0010;
        public const uint MOUSEEVENTF_MIDDLEDOWN = 0x0020;
        public const uint MOUSEEVENTF_MIDDLEUP = 0x0040;
        public const uint MOUSEEVENTF_WHEEL = 0x0800;

        [DllImport("user32.dll", SetLastError = true)]
        public static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);

        [StructLayout(LayoutKind.Sequential)]
        public struct INPUT {
            public uint type;
            public InputUnion U;
            public static int Size { get { return Marshal.SizeOf(typeof(INPUT)); } }
        }

        [StructLayout(LayoutKind.Explicit)]
        public struct InputUnion {
            [FieldOffset(0)] public MOUSEINPUT mi;
            [FieldOffset(0)] public KEYBDINPUT ki;
        }

        [StructLayout(LayoutKind.Sequential)]
        public struct MOUSEINPUT {
            public int dx;
            public int dy;
            public uint mouseData;
            public uint dwFlags;
            public uint time;
            public IntPtr dwExtraInfo;
        }

        [StructLayout(LayoutKind.Sequential)]
        public struct KEYBDINPUT {
            public ushort wVk;
            public ushort wScan;
            public uint dwFlags;
            public uint time;
            public IntPtr dwExtraInfo;
        }

        public const uint INPUT_KEYBOARD = 1;
        public const uint KEYEVENTF_KEYUP = 0x0002;
        public const uint KEYEVENTF_UNICODE = 0x0004;

        public const ushort VK_SHIFT = 0x10;
        public const ushort VK_CONTROL = 0x11;
        public const ushort VK_MENU = 0x12;
        public const ushort VK_LWIN = 0x5B;

        public static float GetVolume() {
            try {
                var enumerator = (IMMDeviceEnumerator)(new MMDeviceEnumeratorComObject());
                IMMDevice dev = null;
                enumerator.GetDefaultAudioEndpoint(0, 1, out dev);
                var iid = typeof(IAudioEndpointVolume).GUID;
                IAudioEndpointVolume epv = null;
                dev.Activate(ref iid, 1, IntPtr.Zero, out epv);
                float vol = 0;
                epv.GetMasterVolumeLevelScalar(out vol);
                return (float)Math.Round(vol * 100);
            } catch { return 50f; }
        }

        public static bool GetMute() {
            try {
                var enumerator = (IMMDeviceEnumerator)(new MMDeviceEnumeratorComObject());
                IMMDevice dev = null;
                enumerator.GetDefaultAudioEndpoint(0, 1, out dev);
                var iid = typeof(IAudioEndpointVolume).GUID;
                IAudioEndpointVolume epv = null;
                dev.Activate(ref iid, 1, IntPtr.Zero, out epv);
                bool mute = false;
                epv.GetMute(out mute);
                return mute;
            } catch { return false; }
        }

        public static void SetVolume(float vol) {
            try {
                var enumerator = (IMMDeviceEnumerator)(new MMDeviceEnumeratorComObject());
                IMMDevice dev = null;
                enumerator.GetDefaultAudioEndpoint(0, 1, out dev);
                var iid = typeof(IAudioEndpointVolume).GUID;
                IAudioEndpointVolume epv = null;
                dev.Activate(ref iid, 1, IntPtr.Zero, out epv);
                epv.SetMasterVolumeLevelScalar(Math.Max(0, Math.Min(100, vol)) / 100.0f, IntPtr.Zero);
            } catch {}
        }

        public static void SetMute(bool mute) {
            try {
                var enumerator = (IMMDeviceEnumerator)(new MMDeviceEnumeratorComObject());
                IMMDevice dev = null;
                enumerator.GetDefaultAudioEndpoint(0, 1, out dev);
                var iid = typeof(IAudioEndpointVolume).GUID;
                IAudioEndpointVolume epv = null;
                dev.Activate(ref iid, 1, IntPtr.Zero, out epv);
                epv.SetMute(mute, IntPtr.Zero);
            } catch {}
        }

        public static void ClickAt(int x, int y, string btn) {
            SetCursorPos(x, y);
            System.Threading.Thread.Sleep(30);
            if (btn == "right") {
                mouse_event(MOUSEEVENTF_RIGHTDOWN, (uint)x, (uint)y, 0, 0);
                System.Threading.Thread.Sleep(20);
                mouse_event(MOUSEEVENTF_RIGHTUP, (uint)x, (uint)y, 0, 0);
            } else if (btn == "double") {
                mouse_event(MOUSEEVENTF_LEFTDOWN, (uint)x, (uint)y, 0, 0);
                mouse_event(MOUSEEVENTF_LEFTUP, (uint)x, (uint)y, 0, 0);
                System.Threading.Thread.Sleep(50);
                mouse_event(MOUSEEVENTF_LEFTDOWN, (uint)x, (uint)y, 0, 0);
                mouse_event(MOUSEEVENTF_LEFTUP, (uint)x, (uint)y, 0, 0);
            } else {
                mouse_event(MOUSEEVENTF_LEFTDOWN, (uint)x, (uint)y, 0, 0);
                System.Threading.Thread.Sleep(20);
                mouse_event(MOUSEEVENTF_LEFTUP, (uint)x, (uint)y, 0, 0);
            }
        }

        public static void MoveTo(int x, int y) {
            SetCursorPos(x, y);
        }

        public static void MouseDown(int x, int y, string btn) {
            SetCursorPos(x, y);
            System.Threading.Thread.Sleep(10);
            uint flag;
            if (btn == "right") flag = MOUSEEVENTF_RIGHTDOWN;
            else if (btn == "middle") flag = MOUSEEVENTF_MIDDLEDOWN;
            else flag = MOUSEEVENTF_LEFTDOWN;
            mouse_event(flag, (uint)x, (uint)y, 0, 0);
        }

        public static void MouseUp(int x, int y, string btn) {
            SetCursorPos(x, y);
            uint flag;
            if (btn == "right") flag = MOUSEEVENTF_RIGHTUP;
            else if (btn == "middle") flag = MOUSEEVENTF_MIDDLEUP;
            else flag = MOUSEEVENTF_LEFTUP;
            mouse_event(flag, (uint)x, (uint)y, 0, 0);
        }

        // delta is wheel notch count: positive scrolls up, negative scrolls down (1 notch = 120 WHEEL_DELTA)
        public static void Scroll(int x, int y, int delta) {
            SetCursorPos(x, y);
            mouse_event(MOUSEEVENTF_WHEEL, (uint)x, (uint)y, unchecked((uint)(delta * 120)), 0);
        }

        private static ushort ResolveVk(string name) {
            if (string.IsNullOrEmpty(name)) return 0;
            string k = name.Trim().ToLowerInvariant();
            switch (k) {
                case "backspace": case "back": return 0x08;
                case "tab": return 0x09;
                case "enter": case "return": return 0x0D;
                case "esc": case "escape": return 0x1B;
                case "space": return 0x20;
                case "pageup": return 0x21;
                case "pagedown": return 0x22;
                case "end": return 0x23;
                case "home": return 0x24;
                case "left": return 0x25;
                case "up": return 0x26;
                case "right": return 0x27;
                case "down": return 0x28;
                case "insert": return 0x2D;
                case "delete": case "del": return 0x2E;
                case "printscreen": return 0x2C;
                case "win": case "meta": case "super": return 0x5B;
                case "f1": return 0x70; case "f2": return 0x71; case "f3": return 0x72;
                case "f4": return 0x73; case "f5": return 0x74; case "f6": return 0x75;
                case "f7": return 0x76; case "f8": return 0x77; case "f9": return 0x78;
                case "f10": return 0x79; case "f11": return 0x7A; case "f12": return 0x7B;
            }
            if (k.Length == 1) {
                char c = char.ToUpperInvariant(k[0]);
                if ((c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9')) return (ushort)c;
            }
            return 0;
        }

        private static void SendVk(ushort vk, bool keyUp) {
            INPUT[] inp = new INPUT[1];
            inp[0].type = INPUT_KEYBOARD;
            inp[0].U.ki.wVk = vk;
            inp[0].U.ki.dwFlags = keyUp ? KEYEVENTF_KEYUP : 0;
            SendInput(1, inp, INPUT.Size);
        }

        // key name (enter/esc/a/f5 etc, see ResolveVk), modifiers comma separated: ctrl,alt,shift,win
        public static void KeyCombo(string name, string modifiers) {
            ushort vk = ResolveVk(name);
            if (vk == 0) return;
            string[] mods = (modifiers ?? "").Split(new[] { ',' }, StringSplitOptions.RemoveEmptyEntries);
            bool ctrl = false, alt = false, shift = false, win = false;
            foreach (var m in mods) {
                string s = m.Trim().ToLowerInvariant();
                if (s == "ctrl" || s == "control") ctrl = true;
                else if (s == "alt") alt = true;
                else if (s == "shift") shift = true;
                else if (s == "win" || s == "meta") win = true;
            }
            if (ctrl) SendVk(VK_CONTROL, false);
            if (alt) SendVk(VK_MENU, false);
            if (shift) SendVk(VK_SHIFT, false);
            if (win) SendVk(VK_LWIN, false);
            System.Threading.Thread.Sleep(10);
            SendVk(vk, false);
            System.Threading.Thread.Sleep(20);
            SendVk(vk, true);
            if (win) SendVk(VK_LWIN, true);
            if (shift) SendVk(VK_SHIFT, true);
            if (alt) SendVk(VK_MENU, true);
            if (ctrl) SendVk(VK_CONTROL, true);
        }

        // Unicode text injection (supports CJK etc), handles surrogate pairs with delay
        public static void SendUnicodeText(string text) {
            if (string.IsNullOrEmpty(text)) return;
            for (int i = 0; i < text.Length; i++) {
                char c = text[i];
                if (char.IsHighSurrogate(c) && i + 1 < text.Length && char.IsLowSurrogate(text[i + 1])) {
                    INPUT[] downs = new INPUT[2];
                    for (int j = 0; j < 2; j++) {
                        downs[j].type = INPUT_KEYBOARD;
                        downs[j].U.ki.wScan = (ushort)text[i + j];
                        downs[j].U.ki.dwFlags = KEYEVENTF_UNICODE;
                    }
                    SendInput(2, downs, INPUT.Size);
                    INPUT[] ups = new INPUT[2];
                    for (int j = 0; j < 2; j++) {
                        ups[j].type = INPUT_KEYBOARD;
                        ups[j].U.ki.wScan = (ushort)text[i + j];
                        ups[j].U.ki.dwFlags = KEYEVENTF_UNICODE | KEYEVENTF_KEYUP;
                    }
                    SendInput(2, ups, INPUT.Size);
                    i++;
                } else {
                    INPUT[] inp = new INPUT[2];
                    inp[0].type = INPUT_KEYBOARD;
                    inp[0].U.ki.wScan = (ushort)c;
                    inp[0].U.ki.dwFlags = KEYEVENTF_UNICODE;
                    inp[1].type = INPUT_KEYBOARD;
                    inp[1].U.ki.wScan = (ushort)c;
                    inp[1].U.ki.dwFlags = KEYEVENTF_UNICODE | KEYEVENTF_KEYUP;
                    SendInput(2, inp, INPUT.Size);
                }
                if (i % 16 == 15) System.Threading.Thread.Sleep(5);
            }
        }

        public static void CaptureScreenToStream(int displayIndex, double scale, int quality, System.IO.Stream outStream) {
            Screen[] screens = Screen.AllScreens;
            Screen scr = (displayIndex >= 0 && displayIndex < screens.Length) ? screens[displayIndex] : Screen.PrimaryScreen;
            Rectangle bounds = scr.Bounds;

            IntPtr deskWnd = GetDesktopWindow();
            IntPtr srcDC = GetWindowDC(deskWnd);
            IntPtr memDC = CreateCompatibleDC(srcDC);
            IntPtr hBmp = CreateCompatibleBitmap(srcDC, bounds.Width, bounds.Height);
            IntPtr oldBmp = SelectObject(memDC, hBmp);

            BitBlt(memDC, 0, 0, bounds.Width, bounds.Height, srcDC, bounds.X, bounds.Y, SRCCOPY);
            SelectObject(memDC, oldBmp);

            using (Bitmap bmp = Image.FromHbitmap(hBmp)) {
                Bitmap targetBmp = bmp;
                Bitmap scaledBmp = null;

                if (scale > 0 && scale < 1.0) {
                    int w = Math.Max(1, (int)(bounds.Width * scale));
                    int h = Math.Max(1, (int)(bounds.Height * scale));
                    scaledBmp = new Bitmap(w, h);
                    using (Graphics sg = Graphics.FromImage(scaledBmp)) {
                        sg.InterpolationMode = System.Drawing.Drawing2D.InterpolationMode.Bilinear;
                        sg.DrawImage(bmp, 0, 0, w, h);
                    }
                    targetBmp = scaledBmp;
                }

                ImageCodecInfo jpegCodec = null;
                foreach (var codec in ImageCodecInfo.GetImageEncoders()) {
                    if (codec.MimeType == "image/jpeg") {
                        jpegCodec = codec;
                        break;
                    }
                }

                using (EncoderParameters ep = new EncoderParameters(1)) {
                    ep.Param[0] = new EncoderParameter(System.Drawing.Imaging.Encoder.Quality, (long)quality);
                    using (MemoryStream ms = new MemoryStream()) {
                        targetBmp.Save(ms, jpegCodec, ep);
                        byte[] bytes = ms.ToArray();
                        outStream.Write(bytes, 0, bytes.Length);
                    }
                }

                if (scaledBmp != null) {
                    scaledBmp.Dispose();
                }
            }

            DeleteObject(hBmp);
            DeleteDC(memDC);
            ReleaseDC(deskWnd, srcDC);
        }

        public static void CaptureScreen(int displayIndex, double scale, int quality, string outPath) {
            Screen[] screens = Screen.AllScreens;
            Screen scr = (displayIndex >= 0 && displayIndex < screens.Length) ? screens[displayIndex] : Screen.PrimaryScreen;
            Rectangle bounds = scr.Bounds;

            IntPtr deskWnd = GetDesktopWindow();
            IntPtr srcDC = GetWindowDC(deskWnd);
            IntPtr memDC = CreateCompatibleDC(srcDC);
            IntPtr hBmp = CreateCompatibleBitmap(srcDC, bounds.Width, bounds.Height);
            IntPtr oldBmp = SelectObject(memDC, hBmp);

            BitBlt(memDC, 0, 0, bounds.Width, bounds.Height, srcDC, bounds.X, bounds.Y, SRCCOPY);
            SelectObject(memDC, oldBmp);

            using (Bitmap bmp = Image.FromHbitmap(hBmp)) {
                Bitmap targetBmp = bmp;
                Bitmap scaledBmp = null;

                if (scale > 0 && scale < 1.0) {
                    int w = Math.Max(1, (int)(bounds.Width * scale));
                    int h = Math.Max(1, (int)(bounds.Height * scale));
                    scaledBmp = new Bitmap(w, h);
                    using (Graphics sg = Graphics.FromImage(scaledBmp)) {
                        sg.InterpolationMode = System.Drawing.Drawing2D.InterpolationMode.Bilinear;
                        sg.DrawImage(bmp, 0, 0, w, h);
                    }
                    targetBmp = scaledBmp;
                }

                ImageCodecInfo jpegCodec = null;
                foreach (var codec in ImageCodecInfo.GetImageEncoders()) {
                    if (codec.MimeType == "image/jpeg") {
                        jpegCodec = codec;
                        break;
                    }
                }

                using (EncoderParameters ep = new EncoderParameters(1)) {
                    ep.Param[0] = new EncoderParameter(System.Drawing.Imaging.Encoder.Quality, (long)quality);

                    if (!string.IsNullOrEmpty(outPath)) {
                        targetBmp.Save(outPath, jpegCodec, ep);
                    } else {
                        using (MemoryStream ms = new MemoryStream()) {
                            targetBmp.Save(ms, jpegCodec, ep);
                            byte[] bytes = ms.ToArray();
                            using (Stream stdout = Console.OpenStandardOutput()) {
                                stdout.Write(bytes, 0, bytes.Length);
                            }
                        }
                    }
                }

                if (scaledBmp != null) {
                    scaledBmp.Dispose();
                }
            }

            DeleteObject(hBmp);
            DeleteDC(memDC);
            ReleaseDC(deskWnd, srcDC);
        }
    }
}
'@ -ReferencedAssemblies System.Drawing, System.Windows.Forms

switch ($Action) {
    'get-volume' {
        $vol = [LanDiskSystem.Core]::GetVolume()
        $mute = [LanDiskSystem.Core]::GetMute()
        Write-Output (ConvertTo-Json @{ volume = $vol; muted = $mute } -Compress)
    }
    'set-volume' {
        if ($Volume -ge 0) {
            [LanDiskSystem.Core]::SetVolume([float]$Volume)
        }
        if ($Mute -eq 'true') {
            [LanDiskSystem.Core]::SetMute($true)
        } elseif ($Mute -eq 'false') {
            [LanDiskSystem.Core]::SetMute($false)
        } elseif ($Mute -eq 'toggle') {
            $current = [LanDiskSystem.Core]::GetMute()
            [LanDiskSystem.Core]::SetMute(-not $current)
        }
        $vol = [LanDiskSystem.Core]::GetVolume()
        $mute = [LanDiskSystem.Core]::GetMute()
        Write-Output (ConvertTo-Json @{ volume = $vol; muted = $mute } -Compress)
    }
    'screens' {
        $screens = [System.Windows.Forms.Screen]::AllScreens | ForEach-Object -Begin { $i = 0 } -Process {
            @{
                index = $i
                deviceName = $_.DeviceName
                bounds = @{
                    x = $_.Bounds.X
                    y = $_.Bounds.Y
                    width = $_.Bounds.Width
                    height = $_.Bounds.Height
                }
                primary = $_.Primary
            }
            $i++
        }
        Write-Output (ConvertTo-Json $screens -Compress)
    }
    'capture' {
        [LanDiskSystem.Core]::CaptureScreen($Display, $Scale, $Quality, $OutPath)
    }
    'click' {
        [LanDiskSystem.Core]::ClickAt($MouseX, $MouseY, $MouseButton)
        Write-Output '{"success":true}'
    }
    'move' {
        [LanDiskSystem.Core]::MoveTo($MouseX, $MouseY)
        Write-Output '{"success":true}'
    }
    'mousedown' {
        [LanDiskSystem.Core]::MouseDown($MouseX, $MouseY, $MouseButton)
        Write-Output '{"success":true}'
    }
    'mouseup' {
        [LanDiskSystem.Core]::MouseUp($MouseX, $MouseY, $MouseButton)
        Write-Output '{"success":true}'
    }
    'scroll' {
        [LanDiskSystem.Core]::Scroll($MouseX, $MouseY, $Delta)
        Write-Output '{"success":true}'
    }
    'key' {
        [LanDiskSystem.Core]::KeyCombo($KeyName, $Modifiers)
        Write-Output '{"success":true}'
    }
    'text' {
        [LanDiskSystem.Core]::SendUnicodeText($Text)
        Write-Output '{"success":true}'
    }
    'stream' {
        # Resident capture loop: writes [4-byte LE length prefix + JPEG] frames to stdout, parsed by Node and forwarded over WebSocket
        $stdout = [Console]::OpenStandardOutput()
        $interval = [Math]::Max(16, [int](1000 / [Math]::Max(1, $Fps)))
        while ($true) {
            try {
                $sw = [System.Diagnostics.Stopwatch]::StartNew()
                $ms = New-Object System.IO.MemoryStream
                [LanDiskSystem.Core]::CaptureScreenToStream($Display, $Scale, $Quality, $ms)
                $bytes = $ms.ToArray()
                $ms.Dispose()
                $len = [BitConverter]::GetBytes([UInt32]$bytes.Length)
                $stdout.Write($len, 0, 4)
                $stdout.Write($bytes, 0, $bytes.Length)
                $stdout.Flush()
            } catch {}
            $elapsed = [int]$sw.ElapsedMilliseconds
            $wait = $interval - $elapsed
            if ($wait -gt 0) { Start-Sleep -Milliseconds $wait }
        }
    }
}
