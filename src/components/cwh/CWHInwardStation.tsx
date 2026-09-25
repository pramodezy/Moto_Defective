import React, { useState, useMemo } from 'react';
import { 
  PackageCheck, 
  Search, 
  Barcode, 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  Truck, 
  Video, 
  ArrowRight,
  ShieldAlert,
  Building2,
  Filter,
  Send,
  Archive,
  X,
  FileText,
  Layers,
  Sparkles,
  Upload,
  Warehouse,
  Flame,
  ArrowUpDown,
  AlertOctagon
} from 'lucide-react';
import { ShippingOrder, DefectiveItem, CCIMaster, UserProfile, AgeingCriticality } from '../../types/crm';
import { formatINR, formatDate, getCrmStatusStyle, getAgeingBucket, parseDateSafe } from '../../lib/utils';
import { SlaBadge } from '../layout/SlaBadge';
import { 
  getMotorolaStatusInfo, 
  isAwbIssueRequired, 
  isDummyAwb,
  getCwhActionDetails,
  getUnifiedStageDetails,
  getUnifiedPickupStatus,
  isCompletedJourneyStatus
} from '../../lib/motorolaStatus';
import { BulkAwbUploadModal } from './BulkAwbUploadModal';
import { BulkRcDispatchModal } from './BulkRcDispatchModal';
import { CourierReceiptModal } from './CourierReceiptModal';
import { crmDb } from '../../lib/db';
import { toast } from 'sonner';

interface CWHInwardStationProps {
  orders: ShippingOrder[];
  items: DefectiveItem[];
  stations: CCIMaster[];
  user: UserProfile;
  onOpenUnboxing: (order: ShippingOrder) => void;
  onOpenAwbModal: (order: ShippingOrder) => void;
  onSelectOrder: (order: ShippingOrder) => void;
  onDispatchToRc?: (
    soId: string,
    data: { dcNumber: string; courier?: string; remarks?: string }
  ) => void;
  onAcknowledgeDelivery?: (
    soId: string,
    data: {
      cartonCondition: string;
      receivedBoxes: number;
      remarks?: string;
    }
  ) => void;
}

export const CWHInwardStation: React.FC<CWHInwardStationProps> = ({
  orders,
  items,
  stations,
  user,
  onOpenUnboxing,
  onOpenAwbModal,
  onSelectOrder,
  onDispatchToRc,
  onAcknowledgeDelivery,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStation, setSelectedStation] = useState<string>('ALL');
  const [selectedRegion, setSelectedRegion] = useState<string>('ALL');
  const [selectedPriority, setSelectedPriority] = useState<string>('ALL');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [activeSubTab, setActiveSubTab] = useState<
    'needs_awb' | 'pickup_pending' | 'in_transit' | 'awb_reissue' | 'at_cwh' | 'discrepancies' | 'outbound_rc' | 'debit_posting'
  >('needs_awb');
  const [isBulkAwbModalOpen, setIsBulkAwbModalOpen] = useState(false);
  const [isBulkRcDispatchOpen, setIsBulkRcDispatchOpen] = useState(false);
  const [receivingOrder, setReceivingOrder] = useState<ShippingOrder | null>(null);

  // Create DC to RC Modal State
  const [dcModalOrder, setDcModalOrder] = useState<ShippingOrder | null>(null);
  const [lenovoDcNumber, setLenovoDcNumber] = useState('');
  const [dcCourier, setDcCourier] = useState('Bluedart Surface');
  const [rcDestination, setRcDestination] = useState('Lenovo/Motorola Central RC (Mumbai)');
  const [dcDocket, setDcDocket] = useState('');
  const [dcRemarks, setDcRemarks] = useState('');

  // RC Outbound Docket modal state (CWH -> RC dispatch tracking)
  const [rcDocketModalOrder, setRcDocketModalOrder] = useState<ShippingOrder | null>(null);
  const [rcDocketAwb, setRcDocketAwb] = useState('');
  const [rcDocketCourier, setRcDocketCourier] = useState('Bluedart Surface');
  const [rcDocketPickupDate, setRcDocketPickupDate] = useState('');
  const [rcDocketRemarks, setRcDocketRemarks] = useState('');

  const handleOpenRcDocketModal = (so: ShippingOrder) => {
    setRcDocketModalOrder(so);
    setRcDocketAwb(so.asp_outbound_awb || '');
    setRcDocketCourier(so.courier || 'Bluedart Surface');
    setRcDocketPickupDate(so.asp_rc_pickup_date ? so.asp_rc_pickup_date.slice(0, 16) : new Date().toISOString().slice(0, 16));
    setRcDocketRemarks('');
  };

  const handleConfirmRcDocket = (e: React.FormEvent) => {
    e.preventDefault();
    if (!rcDocketModalOrder) return;
    try {
      crmDb.updateRcDocketDetails(
        rcDocketModalOrder.id,
        {
          aspRcShippingOrderCode: rcDocketModalOrder.asp_rc_shipping_order_code,
          aspOutboundAwb: rcDocketAwb,
          courier: rcDocketCourier,
          pickupDate: rcDocketPickupDate,
          remarks: rcDocketRemarks,
        },
        user
      );
      toast.success(`RC Outbound docket updated for ${rcDocketModalOrder.so_code}!`);
      setRcDocketModalOrder(null);
    } catch (err: any) {
      toast.error(err.message || 'Failed to update RC docket');
    }
  };

  const handleOpenDcModal = (so: ShippingOrder) => {
    setDcModalOrder(so);
    const suffix = so.so_code.replace(/[^0-9]/g, '').slice(-5) || '101';
    setLenovoDcNumber(`LEN-DC-${suffix}`);
    setDcCourier(so.courier || 'Bluedart Surface');
    setDcDocket('');
    setDcRemarks('');
  };

  const handleConfirmDcToRc = (e: React.FormEvent) => {
    e.preventDefault();
    if (!dcModalOrder || !lenovoDcNumber.trim()) return;
    if (onDispatchToRc) {
      onDispatchToRc(dcModalOrder.id, {
        dcNumber: lenovoDcNumber.trim(),
        courier: dcCourier,
        remarks: [
          rcDestination ? `RC: ${rcDestination}` : '',
          dcDocket.trim() ? `Docket: ${dcDocket.trim()}` : '',
          dcRemarks.trim() ? dcRemarks.trim() : '',
        ].filter(Boolean).join(' | '),
      });
    }
    setDcModalOrder(null);
  };

  const handleConfirmDelivery = (
    soId: string,
    data: { cartonCondition: string; receivedBoxes: number; remarks?: string }
  ) => {
    if (onAcknowledgeDelivery) {
      onAcknowledgeDelivery(soId, data);
    } else {
      crmDb.acknowledgeCourierDelivery(soId, user, data);
    }
    setReceivingOrder(null);
  };

  // Station name lookup with code normalization
  const stationMap = useMemo(() => {
    const normalizeCode = (c: string) => String(c || '').trim().replace(/^0+/, '') || String(c || '').trim();
    const map = new Map<string, CCIMaster>();
    stations.forEach((st) => {
      map.set(st.station_code, st);
      map.set(st.station_code.padStart(3, '0'), st);
      map.set(normalizeCode(st.station_code), st);
    });
    return map;
  }, [stations]);

  // Unique list of regions
  const availableRegions = useMemo(() => {
    const regSet = new Set<string>();
    stations.forEach((st) => {
      if (st.region?.trim()) regSet.add(st.region.trim());
    });
    if (regSet.size === 0) {
      ['Central', 'East', 'North', 'South', 'West'].forEach((r) => regSet.add(r));
    }
    return Array.from(regSet).sort();
  }, [stations]);

  // Smart barcode scan & inspect handler
  const handleSmartInspect = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!searchQuery.trim()) return;

    const term = searchQuery.trim().toLowerCase();
    const matchedOrder = orders.find(
      (o) =>
        o.so_code.toLowerCase() === term ||
        (o.asp_rc_shipping_order_code && o.asp_rc_shipping_order_code.toLowerCase() === term) ||
        (o.active_awb && o.active_awb.toLowerCase() === term) ||
        (o.excel_ref_awb && o.excel_ref_awb.toLowerCase() === term)
    );

    if (matchedOrder) {
      if (isCompletedJourneyStatus(matchedOrder.motorola_status) || matchedOrder.crm_status === 'Delivered to RC') {
        toast.info(`Consignment ${matchedOrder.so_code} is already completed (${matchedOrder.motorola_status || 'RC Received ASP'}). Action from CWH is finished.`);
        return;
      }
      onOpenUnboxing(matchedOrder);
      setSearchQuery('');
    } else {
      alert(`No active consignment found matching barcode "${searchQuery}". Showing search results below.`);
    }
  };

  // Station and Region filtered orders (strictly excludes completed RC Received ASP where CWH action is finished)
  const stationScopedOrders = useMemo(() => {
    return orders.filter((o) => {
      // Completed RC Received ASP orders have finished their journey; rest in background
      if (isCompletedJourneyStatus(o.motorola_status) || o.crm_status === 'Delivered to RC') {
        return false;
      }
      if (selectedStation !== 'ALL' && o.station_code !== selectedStation) {
        return false;
      }
      const st = stationMap.get(o.station_code);
      const effectiveRegion = st?.region || o.region || 'West';
      if (selectedRegion !== 'ALL' && effectiveRegion !== selectedRegion) {
        return false;
      }
      return true;
    });
  }, [orders, selectedStation, selectedRegion, stationMap]);

  // Categorize orders strictly according to the canonical operational stages:
  // Categorize orders strictly according to the canonical operational stages:
  // 1. Needs Initial AWB Issue: Active 'CCI send to CWH' awaiting token (excludes re-issues & delivered historical records)
  const needsAwbOrders = useMemo(() => {
    return stationScopedOrders.filter((o) => {
      if (o.crm_status === 'Debit Posting') return false;
      const moto = (o.motorola_status || '').toLowerCase();
      const motoInfo = getMotorolaStatusInfo(o.motorola_status);
      if (motoInfo.code >= 3 || motoInfo.isDelivered || moto.includes('cwh received') || moto.includes('send to rc') || moto.includes('rc received')) return false;
      if (o.crm_status === 'Pending AWB Re-Issue' || o.pickup_status === 'Pickup Not Done') return false;
      if (
        o.crm_status === 'Delivered at CWH' ||
        o.crm_status === 'Pending Inward at CWH' ||
        o.crm_status === 'CWH to Create DC' ||
        o.crm_status === 'In Transit' ||
        o.pickup_status === 'Pickup Done'
      ) return false;
      if (motoInfo.code === 1 || o.crm_status === 'CCI to Create DC') return false;
      const hasValidAwb = Boolean(
        (o.active_awb && !isDummyAwb(o.active_awb)) ||
        (o.excel_ref_awb && !isDummyAwb(o.excel_ref_awb))
      );
      return o.crm_status === 'Pending AWB' || !hasValidAwb;
    });
  }, [stationScopedOrders]);

  // 2. Pending AWB Re-Issue: Exception state where CCI reported Pickup Not Done; CWH must cancel & re-issue
  const awbReissueOrders = useMemo(() => {
    return stationScopedOrders.filter((o) => {
      if (o.crm_status === 'Debit Posting') return false;
      return o.crm_status === 'Pending AWB Re-Issue' || o.pickup_status === 'Pickup Not Done';
    });
  }, [stationScopedOrders]);

  // 3. Pickup Pending: AWB assigned, awaiting courier physical pickup from CCI service center
  const pickupPendingOrders = useMemo(() => {
    return stationScopedOrders.filter((o) => {
      if (o.crm_status === 'Debit Posting') return false;
      const moto = (o.motorola_status || '').toLowerCase();
      const motoInfo = getMotorolaStatusInfo(o.motorola_status);
      // Strictly exclude downstream warehouse / RC stages
      if (
        motoInfo.code >= 3 || 
        motoInfo.code === 35 || 
        motoInfo.isDelivered || 
        moto.includes('cwh received') || 
        moto.includes('send to rc') || 
        moto.includes('rc received')
      ) {
        return false;
      }
      // Exclude exception (re-issue)
      if (o.crm_status === 'Pending AWB Re-Issue' || o.pickup_status === 'Pickup Not Done') return false;
      // Exclude Not Return
      if (motoInfo.code === 1 || o.crm_status === 'CCI to Create DC') return false;

      // Strictly exclude orders that have already reached In Transit, Delivered, or Inward
      if (
        o.crm_status === 'In Transit' ||
        o.pickup_status === 'Pickup Done' ||
        o.crm_status === 'Delivered at CWH' ||
        o.crm_status === 'Pending Inward at CWH' ||
        o.crm_status === 'CWH to Create DC' ||
        o.crm_status === 'Discrepancies'
      ) {
        return false;
      }

      const hasValidAwb = Boolean(
        (o.active_awb && !isDummyAwb(o.active_awb)) ||
        (o.excel_ref_awb && !isDummyAwb(o.excel_ref_awb))
      );
      return (o.crm_status === 'Pickup Pending' && hasValidAwb) || (hasValidAwb && o.crm_status !== 'Pending AWB');
    });
  }, [stationScopedOrders]);

  // 4. In Transit (Leg 1 Inbound): CCI confirmed "Pickup Done" (or courier in-scan); parcel en route to CWH
  const inTransitOrders = useMemo(() => {
    return stationScopedOrders.filter((o) => {
      if (o.crm_status === 'Debit Posting') return false;
      const moto = (o.motorola_status || '').toLowerCase();
      const motoInfo = getMotorolaStatusInfo(o.motorola_status);
      // Strictly exclude any downstream warehouse / RC stages
      if (
        motoInfo.code >= 3 || 
        motoInfo.code === 35 || 
        motoInfo.isDelivered || 
        moto.includes('cwh received') || 
        moto.includes('send to rc') || 
        moto.includes('rc received')
      ) {
        return false;
      }
      if (
        o.crm_status === 'Pending AWB Re-Issue' || 
        o.pickup_status === 'Pickup Not Done' ||
        o.crm_status === 'Delivered at CWH' ||
        o.crm_status === 'Pending Inward at CWH' ||
        o.crm_status === 'CWH to Create DC' ||
        o.crm_status === 'Discrepancies'
      ) {
        return false;
      }
      
      return o.crm_status === 'In Transit' || o.pickup_status === 'Pickup Done';
    });
  }, [stationScopedOrders]);

  // 5. At CWH -> CCTV Unboxing & Inward: Physical arrival at CWH bay, staging for warehouse entry
  const atCwhOrders = useMemo(() => {
    return stationScopedOrders.filter((o) => {
      if (o.crm_status === 'Debit Posting') return false;
      const moto = (o.motorola_status || '').toLowerCase();
      const motoInfo = getMotorolaStatusInfo(o.motorola_status);
      // Exclude RC stages
      if (motoInfo.code === 4 || moto.includes('send to rc') || motoInfo.code >= 5 || moto.includes('rc received')) {
        return false;
      }
      // Exclude Discrepancies
      if (
        o.crm_status === 'Discrepancies' ||
        o.crm_status === 'Delivered to RC (Discrepancies)' ||
        motoInfo.code === 35 ||
        motoInfo.code === 6 ||
        moto.includes('discrepanc') ||
        moto.includes('negative')
      ) {
        return false;
      }
      return (
        motoInfo.code === 3 ||
        moto.includes('cwh received') ||
        o.crm_status === 'Delivered at CWH' ||
        o.crm_status === 'Pending Inward at CWH' ||
        o.crm_status === 'CWH to Create DC'
      );
    });
  }, [stationScopedOrders]);

  // 6. Flagged Discrepancies: Screening failed at CWH or discrepancy flagged at RC
  const discrepancyOrders = useMemo(() => {
    return stationScopedOrders.filter((o) => {
      if (o.crm_status === 'Debit Posting') return false;
      const moto = (o.motorola_status || '').toLowerCase();
      const motoInfo = getMotorolaStatusInfo(o.motorola_status);
      return (
        motoInfo.code === 35 ||
        motoInfo.code === 6 ||
        moto.includes('negative') ||
        moto.includes('discrepanc') ||
        o.crm_status === 'Discrepancies' ||
        o.crm_status === 'Delivered to RC (Discrepancies)'
      );
    });
  }, [stationScopedOrders]);

  // 7. Outbound Leg to RC (Leg 2): CWH dispatched DC; en route to RC (Status 4: ASP Send to RC)
  const outboundRcOrders = useMemo(() => {
    return stationScopedOrders.filter((o) => {
      if (o.crm_status === 'Debit Posting') return false;
      const moto = (o.motorola_status || '').toLowerCase();
      const motoInfo = getMotorolaStatusInfo(o.motorola_status);
      if (
        o.crm_status === 'Discrepancies' ||
        o.crm_status === 'Delivered to RC (Discrepancies)' ||
        motoInfo.code === 35 ||
        motoInfo.code === 6 ||
        moto.includes('negative') ||
        moto.includes('discrepanc')
      ) {
        return false;
      }
      // Strictly exclude completed RC Received ASP (action from CWH is finished; rests in background)
      if (
        isCompletedJourneyStatus(o.motorola_status) ||
        motoInfo.code === 5 ||
        moto.includes('rc received') ||
        o.crm_status === 'Delivered to RC'
      ) {
        return false;
      }
      // Strictly include ASP Send to RC (Code 4) or active outbound stages
      return (
        motoInfo.code === 4 ||
        moto.includes('send to rc') ||
        o.crm_status === 'Pickup Pending for RC' ||
        o.crm_status === 'In Transit to RC' ||
        o.crm_status === 'CWH Shipped to RC'
      );
    });
  }, [stationScopedOrders]);

  // 8. Debit Posting: Consignments flagged for debit to CCI station (missing parts, physical damage, CID, IMEI mismatch, etc.)
  const debitPostingOrders = useMemo(() => {
    return stationScopedOrders.filter((o) => o.crm_status === 'Debit Posting');
  }, [stationScopedOrders]);

  const currentDisplayOrders = useMemo(() => {
    switch (activeSubTab) {
      case 'needs_awb':
        return needsAwbOrders;
      case 'pickup_pending':
        return pickupPendingOrders;
      case 'in_transit':
        return inTransitOrders;
      case 'awb_reissue':
        return awbReissueOrders;
      case 'at_cwh':
        return atCwhOrders;
      case 'discrepancies':
        return discrepancyOrders;
      case 'outbound_rc':
        return outboundRcOrders;
      case 'debit_posting':
        return debitPostingOrders;
      default:
        return needsAwbOrders;
    }
  }, [activeSubTab, needsAwbOrders, pickupPendingOrders, inTransitOrders, awbReissueOrders, atCwhOrders, discrepancyOrders, outboundRcOrders, debitPostingOrders]);

  // Dynamic order ageing map (calculated from SO Close Time in defective data items, fallback to max_sr_age)
  const orderAgeMap = useMemo(() => {
    const map = new Map<string, { ageDays: number; closeTimeStr?: string }>();
    const now = Date.now();
    const normalize = (s?: string) => (s || '').trim().toLowerCase();

    // Group items by shipping_order_code and shipping_order_id
    const itemsBySo = new Map<string, DefectiveItem[]>();
    items.forEach((it) => {
      if (it.shipping_order_code) {
        const k = normalize(it.shipping_order_code);
        const arr = itemsBySo.get(k) || [];
        arr.push(it);
        itemsBySo.set(k, arr);
      }
      if (it.shipping_order_id) {
        const k = it.shipping_order_id;
        const arr = itemsBySo.get(k) || [];
        arr.push(it);
        itemsBySo.set(k, arr);
      }
    });

    orders.forEach((so) => {
      const directItems = itemsBySo.get(normalize(so.so_code)) || itemsBySo.get(so.id) || [];
      let maxDays = Number(so.max_sr_age || 0);
      let foundCloseTimeStr: string | undefined = undefined;

      directItems.forEach((it) => {
        if (it.sr_close_timestamp) {
          foundCloseTimeStr = it.sr_close_timestamp;
          const d = parseDateSafe(it.sr_close_timestamp);
          if (d) {
            const days = Math.max(0, Math.floor((now - d.getTime()) / (1000 * 60 * 60 * 24)));
            if (days > maxDays) maxDays = days;
          }
        }
      });

      map.set(so.id, { ageDays: maxDays, closeTimeStr: foundCloseTimeStr });
    });
    return map;
  }, [orders, items]);

  // Priority / Ageing breakdown counts within the currently active KPI bucket
  const priorityCounts = useMemo(() => {
    let superCritical = 0;
    let critical = 0;
    let high = 0;
    let low = 0;

    currentDisplayOrders.forEach((so) => {
      const age = orderAgeMap.get(so.id)?.ageDays ?? Number(so.max_sr_age || 0);
      const bucket = getAgeingBucket(age);
      if (bucket === 'super_critical') superCritical++;
      else if (bucket === 'critical') critical++;
      else if (bucket === 'high') high++;
      else low++;
    });

    return {
      total: currentDisplayOrders.length,
      superCritical,
      critical,
      high,
      low,
    };
  }, [currentDisplayOrders, orderAgeMap]);

  const filteredOrders = useMemo(() => {
    let list = currentDisplayOrders;

    // 1. Priority / Ageing filter
    if (selectedPriority !== 'ALL') {
      list = list.filter((so) => {
        const age = orderAgeMap.get(so.id)?.ageDays ?? Number(so.max_sr_age || 0);
        return getAgeingBucket(age) === selectedPriority;
      });
    }

    // 2. Search query filter
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter((so) => {
        const st = stationMap.get(so.station_code);
        return (
          so.so_code.toLowerCase().includes(q) ||
          (so.asp_rc_shipping_order_code && so.asp_rc_shipping_order_code.toLowerCase().includes(q)) ||
          (so.active_awb && so.active_awb.toLowerCase().includes(q)) ||
          (so.excel_ref_awb && so.excel_ref_awb.toLowerCase().includes(q)) ||
          (so.station_code && so.station_code.toLowerCase().includes(q)) ||
          (st?.station_name && st.station_name.toLowerCase().includes(q)) ||
          (st?.city && st.city.toLowerCase().includes(q)) ||
          (so.city && so.city.toLowerCase().includes(q)) ||
          (so.courier && so.courier.toLowerCase().includes(q))
        );
      });
    }

    // 3. Sort by Ageing (Oldest / Highest Ageing First by default)
    return [...list].sort((a, b) => {
      const ageA = orderAgeMap.get(a.id)?.ageDays ?? Number(a.max_sr_age || 0);
      const ageB = orderAgeMap.get(b.id)?.ageDays ?? Number(b.max_sr_age || 0);
      return sortOrder === 'desc' ? ageB - ageA : ageA - ageB;
    });
  }, [currentDisplayOrders, selectedPriority, searchQuery, sortOrder, stationMap, orderAgeMap]);

  const kpiTabs = [
    {
      id: 'needs_awb',
      label: 'Pending AWB',
      sublabel: 'Action: Issue AWB',
      count: needsAwbOrders.length,
      icon: Barcode,
      activeClasses: 'border-amber-500 bg-amber-50/70 shadow-sm ring-1 ring-amber-500',
      activePill: 'bg-amber-500 text-white',
    },
    {
      id: 'pickup_pending',
      label: 'Pickup Pending',
      sublabel: 'Awaiting Courier at CCI',
      count: pickupPendingOrders.length,
      icon: Clock,
      activeClasses: 'border-blue-500 bg-blue-50/70 shadow-sm ring-1 ring-blue-500',
      activePill: 'bg-blue-600 text-white',
    },
    {
      id: 'in_transit',
      label: 'In-Transit',
      sublabel: 'En Route to CWH',
      count: inTransitOrders.length,
      icon: Truck,
      activeClasses: 'border-sky-500 bg-sky-50/70 shadow-sm ring-1 ring-sky-500',
      activePill: 'bg-sky-600 text-white',
    },
    {
      id: 'awb_reissue',
      label: 'Re-Issue AWB',
      sublabel: 'Pickup Not Done',
      count: awbReissueOrders.length,
      icon: AlertTriangle,
      activeClasses: 'border-rose-500 bg-rose-50/70 shadow-sm ring-1 ring-rose-500',
      activePill: 'bg-rose-600 text-white',
      isException: awbReissueOrders.length > 0,
    },
    {
      id: 'at_cwh',
      label: 'At CWH Hub',
      sublabel: 'Dock Inward & CCTV',
      count: atCwhOrders.length,
      icon: Video,
      activeClasses: 'border-purple-500 bg-purple-50/70 shadow-sm ring-1 ring-purple-500',
      activePill: 'bg-purple-600 text-white',
    },
    {
      id: 'discrepancies',
      label: 'Discrepancies',
      sublabel: 'Screening Flags',
      count: discrepancyOrders.length,
      icon: ShieldAlert,
      activeClasses: 'border-rose-600 bg-rose-50/70 shadow-sm ring-1 ring-rose-600',
      activePill: 'bg-rose-700 text-white',
    },
    {
      id: 'outbound_rc',
      label: 'Outbound to RC',
      sublabel: 'CWH Shipped to RC',
      count: outboundRcOrders.length,
      icon: Send,
      activeClasses: 'border-blue-500 bg-blue-50/70 shadow-sm ring-1 ring-blue-500',
      activePill: 'bg-blue-600 text-white',
    },
    {
      id: 'debit_posting',
      label: 'Debit Posting',
      sublabel: 'Debit to CCI',
      count: debitPostingOrders.length,
      icon: AlertOctagon,
      activeClasses: 'border-rose-600 bg-rose-50/80 shadow-sm ring-1 ring-rose-600',
      activePill: 'bg-rose-700 text-white',
      isException: debitPostingOrders.length > 0,
    },
  ];

  const queueGuidance = {
    needs_awb: {
      desc: 'Generate AWB tokens on courier portal and assign here for station pickup.',
      color: 'text-amber-800 bg-amber-50 border-amber-200',
    },
    pickup_pending: {
      desc: 'AWB token issued by CWH. Awaiting courier physical pickup & station handover.',
      color: 'text-blue-800 bg-blue-50 border-blue-200',
    },
    in_transit: {
      desc: 'Consignment en route with courier. When delivered at warehouse dock, click "Acknowledge Delivery" to record intake.',
      color: 'text-sky-800 bg-sky-50 border-sky-200',
    },
    awb_reissue: {
      desc: 'Courier pickup missed/failed. Cancel stale token and issue a fresh AWB.',
      color: 'text-rose-800 bg-rose-50 border-rose-300 font-semibold',
    },
    at_cwh: {
      desc: 'Consignments delivered at CWH. Staged boxes require CCTV unboxing & screening; verified packages require DC creation to RC.',
      color: 'text-purple-800 bg-purple-50 border-purple-200',
    },
    discrepancies: {
      desc: 'Units flagged as damaged, missing, or mismatched during unboxing inspection.',
      color: 'text-rose-800 bg-rose-50 border-rose-300 font-semibold',
    },
    outbound_rc: {
      desc: 'Dispatched from CWH to destination Repair Center.',
      color: 'text-blue-800 bg-blue-50 border-blue-200',
    },
    debit_posting: {
      desc: 'Consignments held for commercial debit to CCI station due to missing parts, physical damage, CID, or IMEI mismatch.',
      color: 'text-rose-900 bg-rose-50 border-rose-300 font-semibold',
    },
  }[activeSubTab];

  return (
    <div className="space-y-3">
      {/* 1. Interactive KPI Metric Pipeline Cards (8 Active Direct Stages) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-2">
        {kpiTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeSubTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id as any)}
              className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer relative overflow-hidden flex flex-col justify-between ${
                isActive
                  ? tab.activeClasses
                  : 'bg-white hover:bg-slate-50/90 border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center justify-between gap-1 mb-1.5">
                <div className={`p-1.5 rounded-lg ${isActive ? tab.activePill : 'bg-slate-100 text-slate-600'}`}>
                  <Icon className="w-3.5 h-3.5" />
                </div>
                {tab.isException && !isActive && (
                  <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                )}
                {isActive && (
                  <span className="w-2 h-2 rounded-full bg-current" />
                )}
              </div>
              <div>
                <div className="text-xl font-bold font-mono tracking-tight text-slate-900">
                  {tab.count}
                </div>
                <div className="text-xs font-semibold text-slate-800 truncate mt-0.5">
                  {tab.label}
                </div>
                <div className="text-[10px] text-slate-500 truncate">
                  {tab.sublabel}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* 2. Unified Command & Filter Bar */}
      <div className="p-2.5 bg-white border border-slate-200 rounded-xl shadow-xs flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-2.5">
        {/* Smart Search & Barcode Scan Input */}
        <form onSubmit={handleSmartInspect} className="relative flex-1 min-w-[280px]">
          <Barcode className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Scan barcode or search SO, AWB, Station..."
            className="w-full pl-9 pr-24 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#001489] focus:bg-white transition-colors"
          />
          {searchQuery ? (
            <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
                title="Clear"
              >
                <X className="w-3.5 h-3.5" />
              </button>
              <button
                type="submit"
                className="px-2 py-0.5 text-[11px] font-semibold bg-[#001489] hover:bg-[#08209e] text-white rounded cursor-pointer"
                title="Inspect Barcode"
              >
                Inspect
              </button>
            </div>
          ) : (
            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 font-sans pointer-events-none">
              Press Enter to Inspect
            </span>
          )}
        </form>

        <div className="flex flex-wrap items-center gap-2">
          {/* Station Scope Selector */}
          <select
            value={selectedStation}
            onChange={(e) => setSelectedStation(e.target.value)}
            aria-label="Filter by Station"
            className="bg-slate-50 border border-slate-300 text-slate-700 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-[#001489] transition-colors"
          >
            <option value="ALL">All Stations ({orders.length})</option>
            {stations.map((st) => (
              <option key={st.station_code} value={st.station_code}>
                {st.station_code} - {st.station_name}
              </option>
            ))}
          </select>

          {/* Region Scope Selector */}
          <select
            value={selectedRegion}
            onChange={(e) => setSelectedRegion(e.target.value)}
            aria-label="Filter by Region"
            className="bg-slate-50 border border-slate-300 text-slate-700 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-[#001489] transition-colors"
          >
            <option value="ALL">All Regions</option>
            {availableRegions.map((reg) => (
              <option key={reg} value={reg}>
                {reg} Region
              </option>
            ))}
          </select>

          {/* Reset Filters Button */}
          {(selectedStation !== 'ALL' || selectedRegion !== 'ALL' || selectedPriority !== 'ALL' || searchQuery) && (
            <button
              type="button"
              onClick={() => {
                setSelectedStation('ALL');
                setSelectedRegion('ALL');
                setSelectedPriority('ALL');
                setSortOrder('desc');
                setSearchQuery('');
              }}
              className="text-xs text-[#001489] hover:underline font-medium cursor-pointer whitespace-nowrap px-1"
            >
              Reset
            </button>
          )}

          {/* Upload Bulk AWB or Bulk RC Dispatch Button */}
          {activeSubTab === 'outbound_rc' ? (
            <button
              type="button"
              onClick={() => setIsBulkRcDispatchOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition-all cursor-pointer whitespace-nowrap ml-auto"
            >
              <Truck className="w-3.5 h-3.5" />
              Bulk Upload RC Dispatch
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setIsBulkAwbModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition-all cursor-pointer whitespace-nowrap ml-auto"
            >
              <Upload className="w-3.5 h-3.5" />
              Upload Bulk AWB Sheet
            </button>
          )}
        </div>
      </div>

      {/* 2.5 Interactive Ageing Criticality Pills & Sorting Toolbar */}
      <div className="p-2 bg-white border border-slate-200 rounded-xl shadow-xs flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider px-1 flex items-center gap-1">
            <Flame className="w-3.5 h-3.5 text-rose-600" />
            Ageing Criticality:
          </span>

          {/* All */}
          <button
            type="button"
            onClick={() => setSelectedPriority('ALL')}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              selectedPriority === 'ALL'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200'
            }`}
          >
            All ({priorityCounts.total})
          </button>

          {/* Super Critical >25d */}
          <button
            type="button"
            onClick={() => setSelectedPriority('super_critical')}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              selectedPriority === 'super_critical'
                ? 'bg-rose-700 text-white shadow-xs ring-1 ring-rose-700'
                : 'bg-rose-50/80 text-rose-900 hover:bg-rose-100 border border-rose-300'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-rose-600 animate-pulse" />
            Super Critical (&gt;25d)
            <span className={`ml-0.5 px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold ${
              selectedPriority === 'super_critical' ? 'bg-white/20 text-white' : 'bg-rose-200/90 text-rose-950'
            }`}>
              {priorityCounts.superCritical}
            </span>
          </button>

          {/* Critical 16-25d */}
          <button
            type="button"
            onClick={() => setSelectedPriority('critical')}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              selectedPriority === 'critical'
                ? 'bg-rose-600 text-white shadow-xs ring-1 ring-rose-600'
                : 'bg-rose-50 text-rose-800 hover:bg-rose-100 border border-rose-200'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-rose-500" />
            Critical (16-25d)
            <span className={`ml-0.5 px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold ${
              selectedPriority === 'critical' ? 'bg-white/20 text-white' : 'bg-rose-100 text-rose-800'
            }`}>
              {priorityCounts.critical}
            </span>
          </button>

          {/* High 8-15d */}
          <button
            type="button"
            onClick={() => setSelectedPriority('high')}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              selectedPriority === 'high'
                ? 'bg-amber-500 text-white shadow-xs ring-1 ring-amber-500'
                : 'bg-amber-50 text-amber-900 hover:bg-amber-100 border border-amber-200'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            High (8-15d)
            <span className={`ml-0.5 px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold ${
              selectedPriority === 'high' ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-900'
            }`}>
              {priorityCounts.high}
            </span>
          </button>

          {/* Low 0-7d */}
          <button
            type="button"
            onClick={() => setSelectedPriority('low')}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              selectedPriority === 'low'
                ? 'bg-emerald-600 text-white shadow-xs ring-1 ring-emerald-600'
                : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            Low (0-7d)
            <span className={`ml-0.5 px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold ${
              selectedPriority === 'low' ? 'bg-white/20 text-white' : 'bg-emerald-100 text-emerald-900'
            }`}>
              {priorityCounts.low}
            </span>
          </button>
        </div>

        {/* Age Sorting Toggle */}
        <button
          type="button"
          onClick={() => setSortOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'))}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 transition-colors cursor-pointer ml-auto"
          title="Toggle Age Sorting Order"
        >
          <ArrowUpDown className="w-3.5 h-3.5 text-slate-500" />
          <span>Sort Age: <strong className="text-slate-900">{sortOrder === 'desc' ? 'Oldest / Critical First' : 'Newest First'}</strong></span>
        </button>
      </div>

      {/* 3. Clean Data Table for Consignments with Integrated Context Badge */}
      <div className="space-y-2">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              {kpiTabs.find((t) => t.id === activeSubTab)?.label} Queue
            </span>
            <span className="px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-slate-100 text-slate-700 border border-slate-200">
              {filteredOrders.length}
            </span>
            {queueGuidance && (
              <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] border ${queueGuidance.color}`}>
                <span>{queueGuidance.desc}</span>
              </span>
            )}
          </div>
          <span className="text-[11px] text-slate-500">
            Scope: <strong className="text-slate-800 font-mono">{stationScopedOrders.length}</strong> active consignments
          </span>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-100/90 text-slate-600 border-b border-slate-200 font-mono text-[11px] tracking-wider uppercase">
              <tr>
                <th className="py-3 px-3.5 whitespace-nowrap">Shipping Order</th>
                <th className="py-3 px-3.5 whitespace-nowrap">Origin Station &amp; Location</th>
                <th className="py-3 px-3.5 whitespace-nowrap">Status (CRM &amp; Moto)</th>
                <th className="py-3 px-3.5 whitespace-nowrap">Courier &amp; AWB</th>
                <th className="py-3 px-3.5 text-center whitespace-nowrap">Items</th>
                <th className="py-3 px-3.5 text-right whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-slate-700 bg-white">
              {filteredOrders.map((so) => {
                const station = stationMap.get(so.station_code);
                const normalize = (s?: string) => (s || '').trim().toLowerCase();
                const orderItems = items.filter(
                  (i) =>
                    normalize(i.shipping_order_code) === normalize(so.so_code) ||
                    (i.shipping_order_id && i.shipping_order_id === so.id)
                );
                const motoInfo = getMotorolaStatusInfo(so.motorola_status);
                const isReissue = so.crm_status === 'Pending AWB Re-Issue' || so.pickup_status === 'Pickup Not Done';
                const isDiscrepancy = 
                  so.crm_status === 'Discrepancies' || 
                  so.crm_status === 'Delivered to RC (Discrepancies)' ||
                  activeSubTab === 'discrepancies';

                return (
                  <tr 
                    key={so.id}
                    className={`hover:bg-slate-50/80 transition-colors ${
                      isReissue ? 'bg-amber-50/40' : isDiscrepancy ? 'bg-rose-50/50' : ''
                    }`}
                  >
                    {/* Column 1: SO Code & SLA Badge */}
                    <td className="py-3 px-3.5 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => onSelectOrder(so)}
                          className="font-mono font-bold text-slate-900 hover:text-[#001489] hover:underline cursor-pointer"
                        >
                          {so.so_code}
                        </button>
                        <SlaBadge
                          tier={so.priority_tier}
                          ageDays={orderAgeMap.get(so.id)?.ageDays ?? Number(so.max_sr_age || 0)}
                        />
                      </div>
                      {orderAgeMap.get(so.id)?.closeTimeStr && (
                        <div className="text-[10px] text-slate-500 font-sans mt-0.5">
                          SO Closed: {formatDate(orderAgeMap.get(so.id)?.closeTimeStr)}
                        </div>
                      )}
                      {so.asp_rc_shipping_order_code && (
                        <div className="text-[10px] text-blue-700 font-mono mt-0.5">
                          RC SO: {so.asp_rc_shipping_order_code}
                        </div>
                      )}
                    </td>

                    {/* Column 2: Origin Station & Location */}
                    <td className="py-3 px-3.5">
                      <div className="font-semibold text-slate-900 whitespace-nowrap">
                        Station {so.station_code} - {station?.station_name || 'Service Center'}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5 whitespace-nowrap">
                        {[station?.city || so.city, station?.state || so.state].filter(Boolean).join(', ')} 
                        <span className="text-sky-700 ml-1.5 font-medium">({station?.region || so.region || 'West'})</span>
                      </div>
                    </td>

                    {/* Column 3: Status (CRM & Motorola) */}
                    <td className="py-3 px-3.5 whitespace-nowrap">
                      {(() => {
                        const stage = getUnifiedStageDetails(so);
                        return (
                          <div className="flex flex-col gap-1 items-start">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${motoInfo.badgeClass}`}>
                              {motoInfo.label}
                            </span>
                            <span 
                              className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${stage.badgeClass}`}
                              title={stage.meaning}
                            >
                              {stage.stageName}
                            </span>
                          </div>
                        );
                      })()}
                    </td>

                    {/* Column 4: Courier & AWB / Outbound Docket */}
                    <td className="py-3 px-3.5 whitespace-nowrap">
                      {activeSubTab === 'outbound_rc' ? (
                        <div>
                          <div className="text-slate-800 font-semibold flex items-center gap-1.5">
                            <Truck className="w-3 h-3 text-blue-600" />
                            <span>{so.courier || 'BlueDart Express'}</span>
                          </div>
                          <div className="font-mono text-[11px] mt-0.5">
                            {so.asp_outbound_awb ? (
                              <span className="font-bold text-blue-900 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
                                AWB: {so.asp_outbound_awb}
                              </span>
                            ) : (
                              <span className="text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 font-sans text-[10px] font-medium">
                                Awaiting RC Docket
                              </span>
                            )}
                          </div>
                          {so.asp_rc_pickup_date && (
                            <div className="text-[10px] text-slate-500 font-sans mt-0.5">
                              Pickup: {formatDate(so.asp_rc_pickup_date)}
                            </div>
                          )}
                          {so.asp_rc_delivered_date && (
                            <div className="text-[10px] text-emerald-700 font-medium font-sans mt-0.5">
                              Delivered at RC: {formatDate(so.asp_rc_delivered_date)}
                            </div>
                          )}
                          {so.so_grn_time && (
                            <div className="text-[10px] text-purple-700 font-semibold font-sans mt-0.5">
                              RC GRN: {formatDate(so.so_grn_time)}
                            </div>
                          )}
                        </div>
                      ) : (
                        <>
                          <div className="text-slate-800 font-medium">
                            {(so.active_awb || so.excel_ref_awb) ? (so.courier || '-') : '-'}
                          </div>
                          <div className="font-mono text-sky-800 text-[11px] mt-0.5 font-medium">
                            {so.active_awb || so.excel_ref_awb || (
                              so.crm_status === 'CWH to Create DC'
                                ? <span className="text-purple-800 font-sans font-medium">CWH Inward Done</span>
                                : motoInfo.isDelivered 
                                  ? <span className="text-emerald-800 font-sans font-medium">Delivered</span> 
                                  : <span className="text-amber-800 font-sans font-medium">Pending CWH AWB</span>
                            )}
                          </div>
                        </>
                      )}
                    </td>

                    {/* Column 5: Items Count */}
                    <td className="py-3 px-3.5 text-center font-mono font-bold text-slate-900 whitespace-nowrap">
                      {orderItems.length > 0
                        ? orderItems.reduce((s, i) => s + (parseInt(String(i.quantity || 1), 10) || 1), 0)
                        : (so.total_items || 1)}
                    </td>

                    {/* Column 6: Required Actions */}
                    <td className="py-3 px-3.5 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        {/* 1. Re-Issue AWB Exception */}
                        {isReissue ? (
                          <button
                            onClick={() => onOpenAwbModal(so)}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-700 hover:bg-rose-800 text-white shadow-xs transition-colors cursor-pointer"
                          >
                            <Barcode className="w-3 h-3" />
                            Re-Issue AWB
                          </button>
                        ) : so.crm_status === 'Pending AWB' ? (
                          /* 2. Initial AWB Issue */
                          <button
                            onClick={() => onOpenAwbModal(so)}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white shadow-xs transition-colors cursor-pointer"
                          >
                            <Barcode className="w-3 h-3" />
                            Issue AWB
                          </button>
                        ) : so.crm_status === 'Debit Posting' || activeSubTab === 'debit_posting' ? (
                          /* Debit Posting */
                          <>
                            <button
                              onClick={() => onSelectOrder(so)}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white shadow-xs transition-colors cursor-pointer"
                              title="Review Debit details or revert back to active pipeline"
                            >
                              <AlertOctagon className="w-3.5 h-3.5" />
                              Manage Debit
                            </button>
                            <button
                              onClick={() => {
                                if (window.confirm(`Revert ${so.so_code} from Debit Posting back to active pipeline?`)) {
                                  crmDb.revertFromDebitPosting(so.id, user);
                                  toast.success(`Consignment ${so.so_code} reverted from Debit Posting.`);
                                }
                              }}
                              className="px-2.5 py-1.5 rounded-lg text-xs bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 font-medium transition-colors cursor-pointer"
                              title="Revert consignment to active pipeline immediately"
                            >
                              Revert
                            </button>
                          </>
                        ) : (so.crm_status === 'CWH to Create DC' && (motoInfo.code === 3 || (so.motorola_status || '').toLowerCase().includes('cwh received'))) ? (
                          /* 3. At CWH & Motorola Status is CWH Received: Create DC to RC */
                          <>
                            <button
                              onClick={() => handleOpenDcModal(so)}
                              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-purple-700 hover:bg-purple-800 text-white shadow-xs transition-colors cursor-pointer"
                              title="Create Delivery Challan to Repair Center (Lenovo CRM)"
                            >
                              <Send className="w-3 h-3" />
                              Create DC to RC
                            </button>
                            <button
                              onClick={() => onOpenUnboxing(so)}
                              title="Review CCTV Inspection"
                              className="px-2 py-1.5 rounded-lg text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 transition-colors cursor-pointer"
                            >
                              <Video className="w-3 h-3" />
                            </button>
                          </>
                        ) : so.crm_status === 'Pending Inward at CWH' ? (
                          /* 4. CCTV Verified Clean — Awaiting Motorola CRM Receipt Entry (CWH Received) */
                          <>
                            <span
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-sky-50 text-sky-900 border border-sky-300 shadow-2xs"
                              title="CCTV physical inspection verified clean. Please update receipt to 'CWH Received' in Motorola CRM to unlock DC creation to RC."
                            >
                              <Clock className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                              Awaiting Moto CRM Inward
                            </span>
                            <button
                              onClick={() => onOpenUnboxing(so)}
                              title="Review CCTV Inspection Log"
                              className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 transition-colors cursor-pointer"
                            >
                              <Video className="w-3 h-3 text-slate-600" />
                              CCTV Log
                            </button>
                          </>
                        ) : so.crm_status === 'Delivered at CWH' ? (
                          /* 5. Delivered at CWH Dock: Staged at Bay -> Perform CCTV Unboxing & Screening */
                          <>
                            <button
                              onClick={() => onOpenUnboxing(so)}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#001489] hover:bg-[#08209e] text-white shadow-xs transition-colors cursor-pointer"
                              title="Unbox consignment under CCTV camera and screen units/parts for discrepancies"
                            >
                              <Video className="w-3.5 h-3.5" />
                              CCTV Inward &amp; Screen
                            </button>
                            <button
                              onClick={() => onSelectOrder(so)}
                              className="px-2.5 py-1.5 rounded-lg text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 transition-colors cursor-pointer"
                            >
                              Details
                            </button>
                          </>
                        ) : isDiscrepancy ? (
                          /* 6. Discrepancy Queue */
                          <>
                            <button
                              onClick={() => onOpenUnboxing(so)}
                              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white shadow-xs transition-colors cursor-pointer"
                            >
                              <AlertTriangle className="w-3 h-3" />
                              Inspect Discrepancies
                            </button>
                            <button
                              onClick={() => onSelectOrder(so)}
                              className="px-2.5 py-1.5 rounded-lg text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 transition-colors cursor-pointer"
                            >
                              View
                            </button>
                          </>
                        ) : so.crm_status === 'In Transit' || activeSubTab === 'in_transit' ? (
                          /* 7. In Transit: Parcel with Courier -> Acknowledge Delivery at CWH Gate */
                          <>
                            <button
                              onClick={() => setReceivingOrder(so)}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition-colors cursor-pointer"
                              title="Acknowledge physical package delivery from courier at CWH dock"
                            >
                              <PackageCheck className="w-3.5 h-3.5" />
                              Acknowledge Delivery
                            </button>
                            <button
                              onClick={() => onSelectOrder(so)}
                              className="px-2.5 py-1.5 rounded-lg text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 transition-colors cursor-pointer"
                            >
                              Details
                            </button>
                          </>
                        ) : so.crm_status === 'Pickup Pending' || activeSubTab === 'pickup_pending' ? (
                          /* 6. Pickup Pending: Awaiting Courier Handover at Station */
                          <>
                            <button
                              onClick={() => onOpenAwbModal(so)}
                              title="Edit / Retoken AWB Docket Number"
                              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-sky-50 text-sky-800 border border-sky-200 hover:border-sky-300 shadow-2xs transition-colors cursor-pointer"
                            >
                              <Barcode className="w-3 h-3 text-sky-700" />
                              Edit AWB
                            </button>
                            <button
                              onClick={() => onSelectOrder(so)}
                              className="px-2.5 py-1.5 rounded-lg text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 transition-colors cursor-pointer"
                            >
                              Details
                            </button>
                          </>
                        ) : (activeSubTab === 'outbound_rc' || (so.motorola_status || '').toLowerCase().includes('send to rc')) ? (
                          /* 7. Outbound RC: Active Tracking up to RC Received ASP */
                          <>
                            <button
                              onClick={() => handleOpenRcDocketModal(so)}
                              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-blue-700 hover:bg-blue-800 text-white shadow-xs transition-colors cursor-pointer"
                              title="Update Outbound Docket & Logistics details for RC dispatch"
                            >
                              <Truck className="w-3 h-3" />
                              Update Docket
                            </button>
                            <button
                              onClick={() => onSelectOrder(so)}
                              className="px-2.5 py-1.5 rounded-lg text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 transition-colors cursor-pointer"
                            >
                              Details
                            </button>
                          </>
                        ) : (
                          /* 8. Fallback History */
                          <button
                            onClick={() => onSelectOrder(so)}
                            className="px-3 py-1.5 rounded-lg text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 transition-colors cursor-pointer"
                          >
                            View Details
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}

              {filteredOrders.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    <CheckCircle2 className="w-8 h-8 mx-auto text-emerald-600 mb-1.5 opacity-80" />
                    <h4 className="text-sm font-semibold text-slate-900">
                      {searchQuery ? 'No matching consignments found' : 'All caught up!'}
                    </h4>
                    <p className="text-xs text-slate-500 mt-0.5 max-w-md mx-auto">
                      {searchQuery ? (
                        <>
                          No consignments in this queue match &quot;{searchQuery}&quot;.
                          <button
                            onClick={() => setSearchQuery('')}
                            className="text-[#001489] hover:underline ml-1 font-medium cursor-pointer"
                          >
                            Clear search
                          </button>
                        </>
                      ) : activeSubTab === 'needs_awb'
                        ? 'No active consignments currently require initial AWB issuance from CWH.'
                        : activeSubTab === 'pickup_pending'
                        ? 'No consignments currently awaiting courier pickup at CCI service centers.'
                        : activeSubTab === 'in_transit'
                        ? 'No consignments currently in transit en route to CWH.'
                        : activeSubTab === 'awb_reissue'
                        ? 'No consignments currently in the AWB re-issue exception queue.'
                        : activeSubTab === 'at_cwh'
                        ? 'No consignments currently at CWH awaiting CCTV inward screening or DC creation.'
                        : activeSubTab === 'discrepancies'
                        ? 'No discrepancies flagged currently.'
                        : activeSubTab === 'outbound_rc'
                        ? 'No consignments currently dispatched outbound to RC.'
                        : 'No historical delivered records found matching the filter.'}
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>

      {/* Modal: Create DC to RC in Lenovo CRM */}
      {dcModalOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="relative w-full max-w-xl rounded-2xl bg-white border border-slate-200 shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-purple-50 border border-purple-200 text-purple-800">
                  <Send className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 font-mono">Create DC to RC (Lenovo CRM)</h3>
                  <p className="text-xs text-slate-500">Outbound Dispatch from CWH to Repair Center</p>
                </div>
              </div>
              <button
                onClick={() => setDcModalOrder(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content */}
            <form onSubmit={handleConfirmDcToRc} className="p-6 space-y-4">
              {/* Consignment Quick Summary */}
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div>
                  <span className="text-slate-500 block text-[10px]">SO Code</span>
                  <span className="font-mono font-bold text-slate-900 text-xs">{dcModalOrder.so_code}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">Origin Station</span>
                  <span className="font-mono font-bold text-sky-800 text-xs">{dcModalOrder.station_code}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">Constituent Items</span>
                  <span className="font-bold text-slate-900 text-xs">
                    {items.filter((i) => (i.shipping_order_code || '').trim().toLowerCase() === dcModalOrder.so_code.trim().toLowerCase() || (i.shipping_order_id && i.shipping_order_id === dcModalOrder.id)).length} units
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">Total Value</span>
                  <span className="font-mono font-bold text-emerald-700 text-xs">{formatINR(dcModalOrder.total_declared_value)}</span>
                </div>
              </div>

              {/* Lenovo DC Number */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center justify-between">
                  <span>Lenovo CRM Delivery Challan (DC) Number <span className="text-rose-500">*</span></span>
                  <span className="text-[10px] text-slate-500 font-normal">Generated in Lenovo CRM</span>
                </label>
                <input
                  type="text"
                  required
                  value={lenovoDcNumber}
                  onChange={(e) => setLenovoDcNumber(e.target.value)}
                  placeholder="e.g. LEN-DC-2026-98901"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs font-mono text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#001489] focus:bg-white transition-colors"
                />
              </div>

              {/* Destination Repair Center & Courier */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Destination Repair Center (RC)
                  </label>
                  <select
                    value={rcDestination}
                    onChange={(e) => setRcDestination(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-700 focus:outline-none focus:border-[#001489] focus:bg-white transition-colors"
                  >
                    <option value="Lenovo/Motorola Central RC (Mumbai)">Lenovo/Motorola Central RC (Mumbai)</option>
                    <option value="Lenovo/Motorola North RC (Delhi/NCR)">Lenovo/Motorola North RC (Delhi/NCR)</option>
                    <option value="Lenovo/Motorola South RC (Bangalore)">Lenovo/Motorola South RC (Bangalore)</option>
                    <option value="Lenovo/Motorola East RC (Kolkata)">Lenovo/Motorola East RC (Kolkata)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Outbound Logistics Partner
                  </label>
                  <select
                    value={dcCourier}
                    onChange={(e) => setDcCourier(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-700 focus:outline-none focus:border-[#001489] focus:bg-white transition-colors"
                  >
                    <option value="Bluedart Surface">Bluedart Surface</option>
                    <option value="Safexpress Logistics">Safexpress Logistics</option>
                    <option value="Delhivery Freight">Delhivery Freight</option>
                    <option value="DTDC Express">DTDC Express</option>
                    <option value="Gati KWE">Gati KWE</option>
                  </select>
                </div>
              </div>

              {/* Outbound Docket / AWB */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Outbound Docket / Courier AWB No. (Optional)
                </label>
                <input
                  type="text"
                  value={dcDocket}
                  onChange={(e) => setDcDocket(e.target.value)}
                  placeholder="e.g. BD-RC-98327101"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-xs font-mono text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#001489] focus:bg-white transition-colors"
                />
              </div>

              {/* Remarks */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Dispatch Remarks / Transit Memo
                </label>
                <textarea
                  rows={2}
                  value={dcRemarks}
                  onChange={(e) => setDcRemarks(e.target.value)}
                  placeholder="e.g. Inward verified clean under CCTV Bay 4. Handed over for RC repair batching."
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#001489] focus:bg-white transition-colors"
                />
              </div>

              {/* Action Buttons */}
              <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setDcModalOrder(null)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl text-xs font-semibold bg-[#001489] hover:bg-[#08209e] text-white shadow-xs flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  Confirm &amp; Dispatch to RC (Status: 4. ASP Send to RC)
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bulk AWB Upload & Verification Modal */}
      <BulkAwbUploadModal
        isOpen={isBulkAwbModalOpen}
        onClose={() => setIsBulkAwbModalOpen(false)}
        onSuccess={(count) => {
          setActiveSubTab('pickup_pending');
          toast.success(`Updated ${count} orders with AWB tokens. Switched to "Pickup Pending" subtab.`);
        }}
        orders={orders}
        stations={stations}
        user={user}
      />

      {/* Bulk RC Dispatch Upload Modal */}
      <BulkRcDispatchModal
        isOpen={isBulkRcDispatchOpen}
        onClose={() => setIsBulkRcDispatchOpen(false)}
        orders={orders}
        stations={stations}
        user={user}
      />

      {/* Courier Dock Receipt Acknowledgment Modal */}
      {receivingOrder && (
        <CourierReceiptModal
          order={receivingOrder}
          onClose={() => setReceivingOrder(null)}
          onConfirm={handleConfirmDelivery}
        />
      )}

      {/* CWH Outbound Docket to RC Modal */}
      {rcDocketModalOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-lg w-full border border-slate-200 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold flex items-center gap-2">
                  <Truck className="w-4 h-4 text-blue-400" />
                  Update RC Outbound Docket &amp; Logistics
                </h3>
                <p className="text-xs text-slate-300 font-mono mt-0.5">
                  Consignment: {rcDocketModalOrder.so_code}
                </p>
              </div>
              <button
                onClick={() => setRcDocketModalOrder(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleConfirmRcDocket} className="p-5 space-y-4">
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-900 leading-relaxed">
                Record or update courier dispatch details for consignment moving from CWH to Repair Center (RC).
                Tracking will remain active in this card until receipt is confirmed in Motorola CRM (<strong>RC Received ASP</strong>).
              </div>

              {/* Auto-Fetched ASP-RC Shipping Order Code */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-700">
                    ASP-RC Shipping Order Code
                  </span>
                  <span className="text-[10px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-md uppercase tracking-wider">
                    Auto-Fetched from Dump
                  </span>
                </div>
                <div className="mt-1.5 font-mono font-bold text-sm">
                  {rcDocketModalOrder.asp_rc_shipping_order_code ? (
                    <span className="text-indigo-900 bg-indigo-50/60 px-2.5 py-1 rounded-lg border border-indigo-100 inline-block">
                      {rcDocketModalOrder.asp_rc_shipping_order_code}
                    </span>
                  ) : (
                    <span className="text-slate-400 font-normal italic text-xs">
                      Awaiting Moto CRM SO Generation in Defective Dump
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-500 mt-1.5">
                  Generated by Motorola CRM once consignment status updates to <strong>ASP Send to RC</strong>.
                </p>
              </div>

              {/* Courier Partner & Outbound AWB / Docket */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Logistics Partner <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={rcDocketCourier}
                    onChange={(e) => setRcDocketCourier(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-700 focus:outline-none focus:border-[#001489] focus:bg-white transition-colors"
                  >
                    <option value="Bluedart Surface">Bluedart Surface</option>
                    <option value="BlueDart Express">BlueDart Express</option>
                    <option value="Safexpress Logistics">Safexpress Logistics</option>
                    <option value="Delhivery Freight">Delhivery Freight</option>
                    <option value="DTDC Express">DTDC Express</option>
                    <option value="Gati KWE">Gati KWE</option>
                    <option value="By Hand / Direct Van">By Hand / Direct Van</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    ASP Outbound SO (AWB) / Docket <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={rcDocketAwb}
                    onChange={(e) => setRcDocketAwb(e.target.value)}
                    placeholder="e.g. 53676493043"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-xs font-mono text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#001489] focus:bg-white transition-colors"
                  />
                </div>
              </div>

              {/* Pickup Date & Time */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Courier Pickup / Handover Date &amp; Time
                </label>
                <input
                  type="datetime-local"
                  value={rcDocketPickupDate}
                  onChange={(e) => setRcDocketPickupDate(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-xs font-mono text-slate-800 focus:outline-none focus:border-[#001489] focus:bg-white transition-colors"
                />
              </div>

              {/* Remarks */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Dispatch Remarks / Carton Details
                </label>
                <textarea
                  rows={2}
                  value={rcDocketRemarks}
                  onChange={(e) => setRcDocketRemarks(e.target.value)}
                  placeholder="e.g. Dispatched in 2 master cartons sealed under CWH dock CCTV."
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#001489] focus:bg-white transition-colors"
                />
              </div>

              {/* Action Buttons */}
              <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setRcDocketModalOrder(null)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl text-xs font-semibold bg-blue-700 hover:bg-blue-800 text-white shadow-xs flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  <Truck className="w-3.5 h-3.5" />
                  Save Docket Details
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

