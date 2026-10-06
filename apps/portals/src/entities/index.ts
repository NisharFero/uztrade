import type { EntityDef } from "../contract.ts";
import { assalomAgro } from "./assalom-agro.ts";
import { customs } from "./customs.ts";
import { expertiza } from "./expertiza.ts";
import { payments } from "./payments.ts";
import { eTranzit } from "./transit-customs.ts";
import { sanitary } from "./sanitary.ts";
import { medicines } from "./medicines.ts";
import { cargoAgent, ecology, edocs } from "./misc.ts";
import { railway } from "./railway.ts";
import { singleWindow } from "./single-window.ts";

/** Every entity with an API. */
export const ENTITIES: EntityDef[] = [singleWindow, railway, customs, assalomAgro, expertiza, payments, eTranzit, sanitary, medicines, ecology, cargoAgent, edocs];

export const entityById = (id: string) => ENTITIES.find((entity) => entity.id === id);
