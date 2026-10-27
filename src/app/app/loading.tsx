export default function AppLoading() {
  return (
    <div className="space-y-5" aria-busy="true" aria-live="polite">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-3">
          <div className="skeleton h-2.5 w-24" />
          <div className="skeleton h-8 w-52" />
          <div className="skeleton h-3 w-80 max-w-full" />
        </div>
        <div className="skeleton h-9 w-28" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((item) => (
          <div className="card space-y-3 p-4" key={item}>
            <div className="skeleton h-2.5 w-20" />
            <div className="skeleton h-7 w-24" />
            <div className="skeleton h-2.5 w-32" />
          </div>
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(300px,0.7fr)]">
        <div className="skeleton h-[420px]" />
        <div className="space-y-3">
          <div className="skeleton h-[130px]" />
          <div className="skeleton h-[130px]" />
          <div className="skeleton h-[130px]" />
        </div>
      </div>
      <span className="sr-only">Loading console</span>
    </div>
  );
}
