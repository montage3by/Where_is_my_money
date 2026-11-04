"""Original calm ambient track for Sunrock Shorts. Fully synthesized (no samples), so rights are clean.

python3 gen.py <out.wav> <seconds> <variant>
variant: "a" = warm D major, "b" = brighter A major
"""
import sys
import wave
import numpy as np

SR = 44100
out, dur, variant = sys.argv[1], float(sys.argv[2]), sys.argv[3]
rng = np.random.default_rng(7 if variant == "a" else 11)
N = int(SR * dur)
t = np.arange(N) / SR

def hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)

BPM = 76
beat = 60 / BPM
bar = 4 * beat

# chord progressions (MIDI notes), one chord per bar
if variant == "a":   # Dmaj9 – Bm9 – Gmaj9 – A6sus  (calm, warm)
    prog = [[50, 57, 62, 66, 69, 76], [47, 54, 61, 62, 66, 73], [43, 50, 59, 62, 66, 69], [45, 52, 59, 61, 64, 66]]
else:                # Amaj9 – F#m9 – Dmaj9 – Esus  (slightly brighter)
    prog = [[45, 52, 57, 61, 64, 71], [42, 49, 56, 57, 61, 68], [38, 45, 54, 57, 61, 64], [40, 47, 54, 56, 59, 61]]

def lowpass(x, cutoff):
    a = np.exp(-2 * np.pi * cutoff / SR)
    y = np.empty_like(x)
    acc = 0.0
    # vectorised one-pole filter via cumulative trick in chunks
    for i in range(0, len(x), 4096):
        seg = x[i:i + 4096]
        out_seg = np.empty_like(seg)
        for j, v in enumerate(seg):
            acc = (1 - a) * v + a * acc
            out_seg[j] = acc
        y[i:i + 4096] = out_seg
    return y

def env_ads(n, att, rel):
    e = np.ones(n)
    a = min(int(att * SR), n)
    r = min(int(rel * SR), n - a)
    if a:
        e[:a] = np.linspace(0, 1, a) ** 2
    if r:
        e[n - r:] *= np.linspace(1, 0, r) ** 2
    return e

pad = np.zeros(N)
piano = np.zeros(N)
bass = np.zeros(N)

nbars = int(np.ceil(dur / bar)) + 1
for b in range(nbars):
    chord = prog[b % len(prog)]
    s0 = int(b * bar * SR)
    if s0 >= N:
        break
    length = min(int((bar + 1.2) * SR), N - s0)
    tt = np.arange(length) / SR
    e = env_ads(length, 1.4, 1.6)
    # pad: detuned soft saw-ish (few harmonics) on upper chord tones
    for m in chord[1:]:
        for det in (-0.07, 0.0, 0.08):
            f = hz(m + det)
            sig = sum(np.sin(2 * np.pi * f * k * tt + rng.uniform(0, 6.28)) / k ** 1.6 for k in range(1, 5))
            pad[s0:s0 + length] += 0.018 * sig * e
    # bass: sine root, soft
    fb = hz(chord[0] - 12 if chord[0] > 45 else chord[0])
    be = env_ads(length, 0.25, 1.4) * np.exp(-tt * 0.35)
    bass[s0:s0 + length] += 0.16 * np.sin(2 * np.pi * fb * tt) * be
    # piano-like arpeggio: 8th notes over chord tones, gentle variation
    arp = chord[2:] + chord[3:-1][::-1]
    for i in range(8):
        if rng.random() < 0.18 and i not in (0, 4):
            continue  # leave some air
        m = arp[i % len(arp)] + (12 if (b % 4 == 3 and i >= 6) else 0)
        n0 = s0 + int(i * beat / 2 * SR + rng.normal(0, 0.006) * SR)
        if n0 < 0 or n0 >= N:
            continue
        ln = min(int(2.8 * SR), N - n0)
        tn = np.arange(ln) / SR
        f = hz(m)
        vel = 0.55 + 0.25 * rng.random() + (0.15 if i in (0, 4) else 0)
        tone = (np.sin(2 * np.pi * f * tn) * np.exp(-tn * 2.2)
                + 0.45 * np.sin(2 * np.pi * 2 * f * tn) * np.exp(-tn * 3.5)
                + 0.18 * np.sin(2 * np.pi * 3 * f * tn) * np.exp(-tn * 5.0)
                + 0.08 * np.sin(2 * np.pi * 4.01 * f * tn) * np.exp(-tn * 7.0))
        hammer = np.minimum(1, tn / 0.004)
        piano[n0:n0 + ln] += 0.11 * vel * tone * hammer

pad = lowpass(pad, 1400)
# slow movement on the pad
pad *= 0.85 + 0.15 * np.sin(2 * np.pi * 0.07 * t)

dry = pad + piano + bass

# stereo: small Haas offsets + different reverbs per side
def reverb(x, secs, seed):
    r = np.random.default_rng(seed)
    n = int(secs * SR)
    ir = r.normal(0, 1, n) * np.exp(-np.arange(n) / SR * (6.9 / secs))
    ir[: int(0.012 * SR)] = 0
    ir /= np.sqrt(np.sum(ir ** 2))
    L = len(x) + n
    nfft = 1 << (L - 1).bit_length()
    y = np.fft.irfft(np.fft.rfft(x, nfft) * np.fft.rfft(ir, nfft), nfft)[: len(x)]
    return lowpass(y, 5000)

wetL = reverb(dry, 3.2, 1)
wetR = reverb(dry, 3.4, 2)
d = int(0.011 * SR)
L = dry + 0.55 * wetL
R = np.concatenate([np.zeros(d), dry[:-d]]) + 0.55 * wetR

# master fade in/out
fade = env_ads(N, 1.2, 2.5)
L, R = L * fade, R * fade
peak = max(np.abs(L).max(), np.abs(R).max())
L, R = L / peak * 0.89, R / peak * 0.89
st = (np.stack([L, R], 1) * 32767).astype(np.int16)
with wave.open(out, "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(st.tobytes())
print("written", out, dur, "s")
