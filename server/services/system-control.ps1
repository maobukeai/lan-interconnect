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
    [int]$Seconds = 0
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
}
