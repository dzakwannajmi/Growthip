import ProtocolStats from "@/components/ProtocolStats";
import ClaimDemo from "@/components/ClaimDemo";
import LiveContractReader from "@/components/LiveContractReader";
import FreighterPayDemo from "@/components/FreighterPayDemo";
const contracts = [
  {
    label: "Growthip Merkle Verifier V3",
    value: "CD3O37X2FIGAHZSM4KVR7XW72HYZOQ75MJF7IZX4LEA6PCKOHMW3N6D2",
  },
  {
    label: "Growthip Pool V3",
    value: "CCSYSAWOUWWBAHDLXXBZ4NL7VIXGCHAMYWNZHNUVUQQUMY4TSGC6IV56",
  },
  {
    label: "Native XLM Token Contract",
    value: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
  },
];

const flow = [
  "Supporter deposits a fixed-value tip and commitment.",
  "GrowthipPool stores the commitment inside the pool.",
  "Creator receives a private note off-chain.",
  "Creator generates a Groth16 proof from the private note.",
  "GrowthipPool verifies root, nullifierHash, recipientHash, and proof.",
  "Recipient receives the token claim if all checks pass.",
];

const tests = [
  "Native BN254 proof verification",
  "Merkle membership proof",
  "Token escrow flow",
  "Wrong root rejection",
  "Double-claim prevention",
  "Wrong recipient rejection",
];

export default function Home() {
  return (
    <main className="min-h-screen overflow-hidden">
      <section className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-6 py-6 lg:px-8">
        <nav className="flex items-center justify-between rounded-full border border-white/10 bg-white/[0.04] px-5 py-4 backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-full bg-neon-violet text-lg font-black shadow-[0_0_40px_rgba(107,69,243,0.65)]">
              G
            </div>
            <div>
              <p className="text-sm font-semibold tracking-wide text-white">
                Growthip
              </p>
              <p className="text-xs text-soft-gray/60">
                Private creator tipping on Stellar
              </p>
            </div>
          </div>

          <div className="hidden items-center gap-6 text-sm text-soft-gray/70 md:flex">
            <a href="#flow" className="hover:text-white">
              Flow
            </a>
            <a href="#contracts" className="hover:text-white">
              Testnet
            </a>
            <a href="#security" className="hover:text-white">
              Security
            </a>
          </div>

          <a
            href="https://github.com/dzakwannajmi/Growthip"
            target="_blank"
            rel="noreferrer"
            className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-midnight-blue transition hover:bg-soft-gray"
          >
            GitHub
          </a>
        </nav>

        <div className="grid flex-1 items-center gap-12 py-16 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <div className="mb-6 inline-flex rounded-full border border-fresh-green/30 bg-fresh-green/10 px-4 py-2 text-sm font-medium text-fresh-green">
              Stellar Testnet deployed · ZK escrow core ready
            </div>

            <h1 className="max-w-4xl text-5xl font-black tracking-tight text-white md:text-7xl">
              Private creator tipping powered by{" "}
              <span className="bg-gradient-to-r from-neon-violet via-white to-fresh-green bg-clip-text text-transparent">
                zero-knowledge proofs.
              </span>
            </h1>

            <p className="mt-6 max-w-2xl text-lg leading-8 text-soft-gray/72">
              Growthip lets supporters send fixed-value tips into a privacy pool,
              while creators claim support with a Groth16 proof. The pool verifies
              the claim without learning which exact deposit is being claimed.
            </p>

            <div className="mt-9 flex flex-col gap-4 sm:flex-row">
              <a
                href="#contracts"
                className="rounded-full bg-neon-violet px-6 py-3 text-center text-sm font-bold text-white shadow-[0_0_45px_rgba(107,69,243,0.55)] transition hover:scale-[1.02]"
              >
                View Testnet Contracts
              </a>
              <a
                href="#flow"
                className="rounded-full border border-white/15 bg-white/[0.04] px-6 py-3 text-center text-sm font-bold text-white backdrop-blur-xl transition hover:bg-white/[0.08]"
              >
                Explore Demo Flow
              </a>
            </div>

            <div className="mt-10 grid max-w-2xl grid-cols-3 gap-3">
              <Stat label="Proof system" value="Groth16" />
              <Stat label="Curve" value="BN254" />
              <Stat label="Network" value="Testnet" />
            </div>
          </div>

          <div className="relative">
            <div className="absolute -inset-8 rounded-[3rem] bg-neon-violet/20 blur-3xl" />
            <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-rich-black/70 p-5 shadow-2xl backdrop-blur-xl">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-white">Live State</p>
                  <p className="text-xs text-soft-gray/55">
                    Initialized on Stellar Testnet
                  </p>
                </div>
                <div className="rounded-full bg-fresh-green/10 px-3 py-1 text-xs font-bold text-fresh-green">
                  ACTIVE
                </div>
              </div>

              <div className="space-y-3">
                <Info
                  label="Current Root"
                  value="08daffaefc12dee54e8d252685e4e44349dc4d9e9c54c8ecf0e8696622b78fe9"
                />
                <Info label="Tip Amount" value="100000000" />
                <Info label="Total Deposits" value="0" />
                <Info label="Total Claims" value="0" />
              </div>

              <div className="mt-6 rounded-2xl border border-white/10 bg-midnight-blue/70 p-4">
                <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-soft-gray/45">
                  Public Inputs
                </p>
                <div className="grid gap-2 text-sm">
                  <Status label="root" value="verified" />
                  <Status label="nullifierHash" value="unused" />
                  <Status label="recipientHash" value="bound" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="flow" className="mx-auto max-w-7xl px-6 py-20 lg:px-8">
        <SectionHeader
          eyebrow="Demo Flow"
          title="A private tip becomes a recipient-bound ZK claim."
          description="Growthip separates deposit and claim using a Merkle proof, a nullifierHash, and a recipientHash binding."
        />

        <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {flow.map((item, index) => (
            <div
              key={item}
              className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur-xl"
            >
              <div className="mb-5 grid h-11 w-11 place-items-center rounded-2xl bg-neon-violet/20 text-sm font-black text-neon-violet">
                {index + 1}
              </div>
              <p className="text-base leading-7 text-soft-gray/75">{item}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="contracts" className="mx-auto max-w-7xl px-6 py-20 lg:px-8">
        <SectionHeader
          eyebrow="Stellar Testnet"
          title="Deployed contracts and initialized pool state."
          description="The Growthip V3 verifier and pool are deployed on Stellar Testnet. commitment = Poseidon(secret, nullifier, recipientHash) — recipient binding is now cryptographic, not just contract-level."
        />

        <div className="mt-10 grid gap-4">
          {contracts.map((contract) => (
            <div
              key={contract.label}
              className="rounded-3xl border border-white/10 bg-black/25 p-5 backdrop-blur-xl"
            >
              <p className="mb-2 text-sm font-semibold text-fresh-green">
                {contract.label}
              </p>
              <p className="break-all font-mono text-sm text-soft-gray/80">
                {contract.value}
              </p>
            </div>
          ))}
        </div>
      </section>

      <ProtocolStats />

      <LiveContractReader />

      <FreighterPayDemo />

      <ClaimDemo />

      <section id="security" className="mx-auto max-w-7xl px-6 py-20 lg:px-8">
        <SectionHeader
          eyebrow="Security Checks"
          title="The core escrow logic is tested before frontend polish."
          description="Growthip intentionally progresses through small verified checkpoints instead of overbuilding UI first."
        />

        <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {tests.map((test) => (
            <div
              key={test}
              className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4"
            >
              <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-fresh-green/15 text-fresh-green">
                ✓
              </div>
              <p className="text-sm text-soft-gray/75">{test}</p>
            </div>
          ))}
        </div>

        <div className="mt-10 rounded-3xl border border-coral-red/20 bg-coral-red/10 p-6">
          <p className="text-sm font-bold text-coral-red">Prototype Notice</p>
          <p className="mt-2 max-w-3xl text-sm leading-7 text-soft-gray/75">
            Growthip is a hackathon/testnet prototype. It is not audited, not
            production-ready, and should not be used with real funds.
          </p>
        </div>
      </section>

      <footer className="mx-auto max-w-7xl px-6 py-10 text-center text-sm text-soft-gray/45 lg:px-8">
        Built by Muhammad Dzakwan Najmi · Growthip on Stellar Testnet
      </footer>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-xl">
      <p className="text-xs text-soft-gray/45">{label}</p>
      <p className="mt-1 text-sm font-bold text-white">{value}</p>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-soft-gray/40">
        {label}
      </p>
      <p className="break-all font-mono text-sm text-soft-gray/85">{value}</p>
    </div>
  );
}

function Status({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-soft-gray/60">{label}</span>
      <span className="text-fresh-green">{value}</span>
    </div>
  );
}

function SectionHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="max-w-3xl">
      <p className="mb-3 text-sm font-bold uppercase tracking-[0.25em] text-fresh-green">
        {eyebrow}
      </p>
      <h2 className="text-3xl font-black tracking-tight text-white md:text-5xl">
        {title}
      </h2>
      <p className="mt-5 text-base leading-8 text-soft-gray/68">{description}</p>
    </div>
  );
}
