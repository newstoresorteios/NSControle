import { notFound } from 'next/navigation';
import { requireTeam } from '@/lib/auth';
import { db } from '@/lib/db';
import { PrintLabel } from '@/components/print-label';

export default async function LabelPage({params}: {params:Promise<{id:string}>}) {
  await requireTeam(true);
  const {id} = await params;
  if (!/^\d+$/.test(id)) notFound();
  const [unit] = await db()`select u.id,u.serial_number,i.model,i.location from ctl_integration_units u join ctl_inventory_items i on i.id=u.inventory_id where u.id=${id}`;
  if (!unit) notFound();
  return <div><div className="integration-label border border-black bg-white p-4 text-black"><p className="text-xs">NEW STORE × REDIRECT</p><h1 className="text-5xl font-bold">#{unit.id}</h1><p>{unit.model}</p><p className="text-sm">Série: {unit.serial_number}</p><p className="text-sm">Local: {unit.location}</p></div><div className="mt-4"><PrintLabel/></div></div>;
}
