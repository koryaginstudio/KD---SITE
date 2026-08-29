import { ClientFixes } from "./client-fixes";
import { LegacyBoot } from "./legacy-boot";

export function LegacyShell() {
  return (
    <>
      <LegacyBoot />
      <ClientFixes />
    </>
  );
}
