import { useCallback, useEffect, useRef, useState } from 'react';

// Drag distance (px) needed to trigger a state change when releasing the sheet.
const COLLAPSE_THRESHOLD = 60;
const EXPAND_THRESHOLD = 40;

/**
 * Owns the draggable bottom sheet's pointer mechanics: expanding/collapsing
 * by dragging its header, plus the header/menu tap handlers that close an
 * in-progress activity form or toggle the sheet.
 *
 * @param {{
 *   sheetState: 'collapsed' | 'expanded',
 *   setSheetState: Function,
 *   activeActivity: object | null,
 *   onCloseActiveForm: Function,
 * }} params
 */
export default function useBottomSheetDrag({
  sheetState,
  setSheetState,
  activeActivity,
  onCloseActiveForm,
}) {
  const [isDragging, setIsDragging] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const sheetRef = useRef(null);
  const dragStartY = useRef(0);
  const dragYRef = useRef(0);
  const isDraggingRef = useRef(false);
  const rafRef = useRef(null);
  const hasDragged = useRef(false);
  const pillsRef = useRef(null);
  const pillsScrollingRef = useRef(false);

  const handlePillsScroll = useCallback(() => {
    const el = pillsRef.current;
    if (!el || pillsScrollingRef.current) return;
    const half = el.scrollWidth / 2;
    let reset = 0;
    if (el.scrollLeft >= half) {
      reset = -half;
    } else if (el.scrollLeft <= 0) {
      reset = half;
    }
    if (reset !== 0) {
      pillsScrollingRef.current = true;
      el.scrollLeft += reset;
      requestAnimationFrame(() => { pillsScrollingRef.current = false; });
    }
  }, []);

  const applyDragTransform = () => {
    rafRef.current = null;
    if (sheetRef.current) {
      sheetRef.current.style.transform = dragYRef.current
        ? `translateY(${dragYRef.current}px)`
        : '';
    }
  };

  const handlePointerDown = (e) => {
    if (activeActivity) return; 
    dragStartY.current = e.clientY;
    dragYRef.current = 0;
    hasDragged.current = false;
    isDraggingRef.current = true;
    setIsDragging(true);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore if not supported
    }
  };

  const handlePointerMove = (e) => {
    if (!isDraggingRef.current) return;
    const delta = e.clientY - dragStartY.current;
    if (Math.abs(delta) > 4) hasDragged.current = true;

    const clamped = sheetState === 'collapsed' ? Math.min(0, delta) : Math.max(0, delta);

    dragYRef.current = clamped;
    if (rafRef.current === null) {
      rafRef.current = requestAnimationFrame(applyDragTransform);
    }
  };

  const finishDrag = () => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    setIsDragging(false);

    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (sheetRef.current) sheetRef.current.style.transform = '';

    const dragY = dragYRef.current;
    dragYRef.current = 0;

    if (sheetState === 'expanded' && dragY > COLLAPSE_THRESHOLD) {
      setSheetState('collapsed');
    } else if (sheetState === 'collapsed' && dragY < -EXPAND_THRESHOLD) {
      setSheetState('expanded');
    }
  };

  useEffect(
    () => () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    },
    []
  );

  const handleHeaderClick = () => {
    if (activeActivity) {
      setIsClosing(true);
      setSheetState('collapsed');
      setTimeout(() => {
        onCloseActiveForm();
        setIsClosing(false);
      }, 280);
      return;
    }
    if (hasDragged.current) return;
    setSheetState((prev) => (prev === 'collapsed' ? 'expanded' : 'collapsed'));
  };

  const handleHeaderMenuToggle = () => {
    if (activeActivity) {
      setIsClosing(true);
      setSheetState('collapsed');
      setTimeout(() => { onCloseActiveForm(); setIsClosing(false); }, 280);
    } else {
      setSheetState('collapsed');
    }
  };

  const handleSidebarMenuToggle = () => {
    if (activeActivity) {
      setIsClosing(true);
      setSheetState('collapsed');
      setTimeout(() => { onCloseActiveForm(); setIsClosing(false); }, 1000);
    } else {
      setSheetState('collapsed');
    }
  };

  return {
    isDragging,
    isClosing,
    sheetRef,
    pillsRef,
    handlePillsScroll,
    handlePointerDown,
    handlePointerMove,
    finishDrag,
    handleHeaderClick,
    handleHeaderMenuToggle,
    handleSidebarMenuToggle,
  };
}
