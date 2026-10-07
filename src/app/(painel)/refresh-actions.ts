"use server";

import { requireTeam } from "@/lib/auth";
import { scheduleBiSync } from "@/lib/bi-sync";
import { scheduleCorreiosSync } from "@/lib/correios-sync";
import { scheduleTraySync } from "@/lib/tray-sync";

let pulling: Promise<boolean> | null = null;

export async function pullRemoteUpdates() {
  await requireTeam();
  if (!pulling) {
    pulling = runPull().finally(() => {
      pulling = null;
    });
  }
  return pulling;
}

async function runPull() {
  const bi = await scheduleBiSync();
  const tray = await scheduleTraySync();
  const correios = await scheduleCorreiosSync();
  return bi || tray || correios;
}
