import { ShippingOrder, DefectiveItem, CCIMaster } from '../types/crm';
import { formatINR, formatDate } from '../lib/utils';

export function printConsignmentManifest(
  order: ShippingOrder,
  items: DefectiveItem[],
  station?: CCIMaster
) {
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('Please allow popups to print manifest');
    return;
  }

  const stationName = station?.station_name || `Station ${order.station_code}`;
  const stationLocation = `${station?.city || ''} ${station?.state || ''} ${station?.region ? `(${station.region})` : ''}`.trim();
  const contact = station?.contact_person ? `${station.contact_person} (${station.contact_phone || ''})` : '';

  const totalQty = items.reduce((sum, i) => sum + (i.quantity || 1), 0);
  const totalVal = items.reduce((sum, i) => sum + ((i.estimated_value || 8000) * (i.quantity || 1)), 0);

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <title>Manifest - ${order.so_code}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      margin: 20px;
      color: #111;
      font-size: 13px;
    }
    .header {
      border-bottom: 2px solid #000;
      padding-bottom: 12px;
      margin-bottom: 16px;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
    }
    .logo-box {
      font-size: 20px;
      font-weight: 800;
      letter-spacing: -0.5px;
    }
    .badge {
      display: inline-block;
      padding: 4px 8px;
      border: 1px solid #000;
      font-weight: bold;
      font-size: 11px;
    }
    .grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
      margin-bottom: 16px;
    }
    .box {
      border: 1px solid #ddd;
      padding: 10px;
      background: #fafafa;
    }
    .box h4 {
      margin: 0 0 6px 0;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #555;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 10px;
      font-size: 12px;
    }
    th, td {
      border: 1px solid #ccc;
      padding: 6px 8px;
      text-align: left;
    }
    th {
      background: #f0f0f0;
      font-weight: 600;
    }
    .footer {
      margin-top: 30px;
      display: flex;
      justify-content: space-between;
      padding-top: 10px;
    }
    .sig-line {
      width: 200px;
      border-top: 1px solid #000;
      text-align: center;
      padding-top: 5px;
      font-size: 11px;
    }
    .barcode {
      font-family: 'Courier New', Courier, monospace;
      font-size: 16px;
      letter-spacing: 4px;
      font-weight: bold;
      background: #eee;
      padding: 6px 12px;
      display: inline-block;
      margin-top: 4px;
    }
    @media print {
      body { margin: 0; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="logo-box">MOTOROLA DEFECTIVE RETURNS</div>
      <div style="font-size: 12px; color: #444; margin-top: 2px;">Reverse Supply Chain Consignment Dispatch Manifest</div>
    </div>
    <div style="text-align: right;">
      <div class="badge">PRIORITY TIER ${order.priority_tier}</div>
      <div style="margin-top: 4px; font-size: 11px;">Date: ${new Date().toLocaleDateString('en-IN')}</div>
    </div>
  </div>

  <div class="grid">
    <div class="box">
      <h4>ORIGIN (SERVICE CENTER / ASP)</h4>
      <div><strong>Station Code:</strong> ${order.station_code}</div>
      <div><strong>Name:</strong> ${stationName}</div>
      <div><strong>Location:</strong> ${stationLocation || 'India'}</div>
      <div><strong>Contact:</strong> ${contact || 'N/A'}</div>
    </div>
    <div class="box">
      <h4>DESTINATION (CENTRAL WAREHOUSE)</h4>
      <div><strong>Consignee:</strong> Motorola Mobility Central Returns CWH</div>
      <div><strong>Address:</strong> Bay 4, Logistics Park, Bhiwandi, MH 421302</div>
      <div><strong>Courier:</strong> ${order.courier}</div>
      <div><strong>Active AWB:</strong> 
        <div class="barcode">${order.active_awb || order.excel_ref_awb || 'AWB-PENDING'}</div>
      </div>
    </div>
  </div>

  <div class="box" style="margin-bottom: 16px;">
    <h4>CONSIGNMENT SUMMARY</h4>
    <div style="display: flex; gap: 24px;">
      <div><strong>SO Code:</strong> ${order.so_code}</div>
      <div><strong>Total Line Items:</strong> ${items.length}</div>
      <div><strong>Total Units:</strong> ${totalQty}</div>
      <div><strong>Declared Value:</strong> ${formatINR(totalVal)}</div>
      <div><strong>E-Way Bill:</strong> ${order.eway_bill_required ? (order.eway_bill_number || 'REQUIRED') : 'Not Applicable'}</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width: 30px;">#</th>
        <th>SR Number</th>
        <th>Defective Part No</th>
        <th>Issued Part No</th>
        <th>Category / Description</th>
        <th>Model</th>
        <th style="width: 40px; text-align: center;">Qty</th>
        <th style="width: 90px; text-align: right;">Est. Value</th>
      </tr>
    </thead>
    <tbody>
      ${items.map((item, i) => `
        <tr>
          <td>${i + 1}</td>
          <td><strong>${item.sr_number}</strong></td>
          <td><code>${item.sr_part_number}</code></td>
          <td><code>${item.new_part_number}</code></td>
          <td>
            <div><strong>${item.part_category}</strong></div>
            <div style="font-size: 11px; color: #555;">${item.part_description || ''}</div>
          </td>
          <td>${item.sr_model_name || '-'}</td>
          <td style="text-align: center;">${item.quantity || 1}</td>
          <td style="text-align: right;">${formatINR((item.estimated_value || 8000) * (item.quantity || 1))}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  <div class="footer">
    <div class="sig-line">
      CCI Dispatch Executive Signature
    </div>
    <div class="sig-line">
      Courier Pickup Partner Signature
    </div>
    <div class="sig-line">
      CWH Inward Verification Signature
    </div>
  </div>

  <script>
    window.onload = function() {
      setTimeout(function() {
        window.print();
      }, 500);
    };
  </script>
</body>
</html>
  `;

  printWindow.document.open();
  printWindow.document.write(htmlContent);
  printWindow.document.close();
}
