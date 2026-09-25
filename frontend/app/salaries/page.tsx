import type { Metadata } from "next";
import { Suspense } from "react";
import Panel from "@/components/ui/Panel";
import ParamSelect from "@/components/mlb/ParamSelect";
import SalaryBoard from "@/components/mlb/SalaryBoard";
import { SkeletonTable } from "@/components/ui/Skeleton";
import { getSalaries, salaryYears, SALARY_FILE } from "@/lib/salaries";

/*
 * Salaries, a season at a time.
 *
 * The only board on the site that isn't read off MLB's API — it has no
 * salary in it — so this one is fed by a file. Which seasons exist is
 * whatever the file covers, and an empty file is a page that says how to
 * fill it rather than a page that looks broken.
 */

export const metadata: Metadata = { title: "Salaries" };

/** What to put on screen before the file exists. */
function Missing() {
  return (
    <div className="space-y-2 border border-line bg-bg px-3 py-6 text-center text-xs text-ink-3">
      <p className="tracking-[0.2em]">NO SALARY DATA</p>
      <p>
        MLB&rsquo;s API carries no salaries. Drop a CSV at{" "}
        <code className="text-ink-2">{SALARY_FILE}</code> and this board fills
        itself.
      </p>
      <p className="text-ink-2">year,name,team,position,salary,mlb_id</p>
      <p>
        The first five are required; <code>mlb_id</code> is what makes each
        name a link. A header spelling its columns differently
        (season/player/pos/tm) is read too.
      </p>
    </div>
  );
}

async function Body({ year }: { year: number }) {
  const salaries = await getSalaries(year);
  if (salaries.length === 0) return <Missing />;
  return <SalaryBoard salaries={salaries} />;
}

export default async function SalariesPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const years = salaryYears();
  const asked = Number((await searchParams).year);
  /* The season asked for if the file has it, else the most recent it does. */
  const year = years.includes(asked) ? asked : (years[0] ?? 0);

  return (
    <div className="mx-auto max-w-[88rem] space-y-3 p-3">
      <Panel
        title={year ? `Salaries — ${year}` : "Salaries"}
        right={
          years.length > 0 && (
            <ParamSelect
              param="year"
              label="YEAR"
              value={String(year)}
              options={years.map((y) => ({ value: String(y), label: String(y) }))}
            />
          )
        }
      >
        <Suspense key={year} fallback={<SkeletonTable rows={12} heading={false} />}>
          <Body year={year} />
        </Suspense>
      </Panel>
    </div>
  );
}
