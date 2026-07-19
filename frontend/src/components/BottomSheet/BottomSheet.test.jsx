import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import BottomSheet from './BottomSheet'

function renderSheet(overrides = {}) {
  const props = {
    sheetRef: { current: null },
    sheetState: 'collapsed',
    isDragging: false,
    isClosing: false,
    hasActiveActivity: false,
    activeActivityLabel: '',
    ongoingActivity: null,
    ongoingElapsed: 0,
    ongoingDistanceLabel: null,
    ongoingParticipantsCount: 0,
    selectedZone: null,
    zoneParticipantsCount: 0,
    nearbyCount: 3,
    filterLabel: null,
    onPointerDown: vi.fn(),
    onPointerMove: vi.fn(),
    onPointerUp: vi.fn(),
    onPointerCancel: vi.fn(),
    onHeaderClick: vi.fn(),
    onZoneBack: vi.fn(),
    onScrimClick: vi.fn(),
    children: <div>body content</div>,
    ...overrides,
  }
  return { ...render(<BottomSheet {...props} />), props }
}

describe('BottomSheet', () => {
  it('renders the default "nearby people" hero when nothing else is active', () => {
    renderSheet({ nearbyCount: 5 })
    expect(screen.getByText('Люди поруч')).toBeInTheDocument()
    expect(screen.getByText('5')).toBeInTheDocument()
  })

  it('renders the active-activity-being-created hero', () => {
    renderSheet({ hasActiveActivity: true, activeActivityLabel: 'Новий збір' })
    expect(screen.getByText('Новий збір')).toBeInTheDocument()
  })

  it('renders the ongoing activity hero with elapsed time and participants', () => {
    renderSheet({
      ongoingActivity: { title: 'Баскетбол', category: 'gathering' },
      ongoingElapsed: 65000,
      ongoingParticipantsCount: 4,
      ongoingDistanceLabel: '250 м',
    })
    expect(screen.getByText('Баскетбол')).toBeInTheDocument()
    expect(screen.getByText('01:05')).toBeInTheDocument()
    expect(screen.getByText('4')).toBeInTheDocument()
    expect(screen.getByText('250 м')).toBeInTheDocument()
    expect(screen.getByText('триває')).toBeInTheDocument()
  })

  it('shows a countdown ("залишилось") for cross activities with a duration', () => {
    renderSheet({
      ongoingActivity: { title: 'Крос', category: 'cross', duration_seconds: 600 },
      ongoingElapsed: 60000,
    })
    expect(screen.getByText('09:00')).toBeInTheDocument()
    expect(screen.getByText('залишилось')).toBeInTheDocument()
  })

  it('falls back to "Збір" as the ongoing activity title when none is set', () => {
    renderSheet({ ongoingActivity: { category: 'gathering' } })
    expect(screen.getByText('Збір')).toBeInTheDocument()
  })

  it('renders the selected-zone hero with a back button', () => {
    renderSheet({
      selectedZone: { title: 'Баскетбольне поле', radius: 100 },
      zoneParticipantsCount: 2,
    })
    expect(screen.getByText('Баскетбольне поле')).toBeInTheDocument()
    expect(screen.getByText('Радіус: 100 м')).toBeInTheDocument()
    expect(screen.getByLabelText('Закрити')).toBeInTheDocument()
  })

  it('defaults zone radius to 80m when not provided', () => {
    renderSheet({ selectedZone: { title: 'Зона' }, zoneParticipantsCount: 1 })
    expect(screen.getByText('Радіус: 80 м')).toBeInTheDocument()
  })

  it('calls onZoneBack (and stops propagation) when the back button is clicked', () => {
    const { props } = renderSheet({ selectedZone: { title: 'Зона' } })
    fireEvent.click(screen.getByLabelText('Закрити'))
    expect(props.onZoneBack).toHaveBeenCalledTimes(1)
    expect(props.onHeaderClick).not.toHaveBeenCalled()
  })

  it('calls onHeaderClick when the header is clicked', () => {
    const { props } = renderSheet()
    fireEvent.click(screen.getByRole('button', { expanded: false }))
    expect(props.onHeaderClick).toHaveBeenCalledTimes(1)
  })

  it('calls onHeaderClick when Enter is pressed on the header', () => {
    const { props } = renderSheet()
    fireEvent.keyDown(screen.getByRole('button', { expanded: false }), { key: 'Enter' })
    expect(props.onHeaderClick).toHaveBeenCalledTimes(1)
  })

  it('calls onHeaderClick when Space is pressed on the header', () => {
    const { props } = renderSheet()
    fireEvent.keyDown(screen.getByRole('button', { expanded: false }), { key: ' ' })
    expect(props.onHeaderClick).toHaveBeenCalledTimes(1)
  })

  it('marks the header aria-expanded when sheetState is expanded', () => {
    renderSheet({ sheetState: 'expanded' })
    expect(screen.getByRole('button', { expanded: true })).toBeInTheDocument()
  })

  it('calls onScrimClick when the scrim is clicked and there is no active activity', () => {
    const { props, container } = renderSheet({ hasActiveActivity: false })
    fireEvent.click(container.querySelector('[aria-hidden="true"]'))
    expect(props.onScrimClick).toHaveBeenCalledTimes(1)
  })

  it('does not call onScrimClick when there is an active activity being created', () => {
    const { props, container } = renderSheet({ hasActiveActivity: true })
    fireEvent.click(container.querySelector('[aria-hidden="true"]'))
    expect(props.onScrimClick).not.toHaveBeenCalled()
  })

  it('shows the filter badge only when collapsed/dragging, not when expanded', () => {
    const { rerender } = renderSheet({ filterLabel: 'Друзі', sheetState: 'collapsed' })
    expect(screen.getByText('Друзі')).toBeInTheDocument()

    rerender(
      <BottomSheet
        sheetRef={{ current: null }}
        sheetState="expanded"
        isDragging={false}
        isClosing={false}
        hasActiveActivity={false}
        ongoingActivity={null}
        selectedZone={null}
        nearbyCount={0}
        filterLabel="Друзі"
        onPointerDown={vi.fn()}
        onPointerMove={vi.fn()}
        onPointerUp={vi.fn()}
        onPointerCancel={vi.fn()}
        onHeaderClick={vi.fn()}
        onZoneBack={vi.fn()}
        onScrimClick={vi.fn()}
      >
        <div />
      </BottomSheet>
    )
    expect(screen.queryByText('Друзі')).not.toBeInTheDocument()
  })

  it('renders the children passed into the sheet body', () => {
    renderSheet({ children: <div>custom body</div> })
    expect(screen.getByText('custom body')).toBeInTheDocument()
  })
})
