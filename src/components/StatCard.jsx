export default function StatCard({ title, value, helper }) {
  return (
    <div className="card p-5">
      <p className="text-sm text-gray-500">{title}</p>
      <h3 className="mt-2 text-3xl font-bold text-gray-800">{value}</h3>
      {helper ? <p className="mt-2 text-sm text-gray-500">{helper}</p> : null}
    </div>
  );
}