import { act, renderHook } from '@testing-library/react-native';
import { BackHandler } from 'react-native';

import { useModalSheet } from '@/hooks/useModalSheet';

// @gorhom/bottom-sheet keeps a never-presented modal in DISMISSING after dismiss(), and then
// ignores every present(): the post sheets never opened. These pin the rules that avoid it.
function setup() {
  const close = jest.fn();
  const sheet = { present: jest.fn(), dismiss: jest.fn() };
  const backHandlers: Parameters<typeof BackHandler.addEventListener>[1][] = [];
  jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_event, handler) => {
    backHandlers.push(handler);
    return { remove: jest.fn() };
  });
  return { close, sheet, backHandlers };
}

async function mount(open: boolean, close: () => void, sheet: object) {
  const hook = await renderHook(({ open: o }: { open: boolean }) => useModalSheet(o, close), {
    initialProps: { open: false },
  });
  // what BottomSheetModal does with the ref on its first render
  (hook.result.current.ref as { current: unknown }).current = sheet;
  if (open) await hook.rerender({ open: true });
  return hook;
}

afterEach(() => jest.restoreAllMocks());

describe('useModalSheet', () => {
  it('never dismisses a sheet it did not present (also not on mount)', async () => {
    const { close, sheet } = setup();
    const hook = await mount(false, close, sheet);
    await hook.rerender({ open: false });
    expect(sheet.dismiss).not.toHaveBeenCalled();
    expect(sheet.present).not.toHaveBeenCalled();
  });

  it('presents when opened and dismisses when closed from the store', async () => {
    const { close, sheet } = setup();
    const hook = await mount(true, close, sheet);
    expect(sheet.present).toHaveBeenCalledTimes(1);
    await hook.rerender({ open: false });
    expect(sheet.dismiss).toHaveBeenCalledTimes(1);
  });

  it('after the sheet closed itself (swipe down) it does not dismiss again, and opens again', async () => {
    const { close, sheet } = setup();
    const hook = await mount(true, close, sheet);
    await act(async () => hook.result.current.onDismiss());
    expect(close).toHaveBeenCalledTimes(1);
    await hook.rerender({ open: false });
    expect(sheet.dismiss).not.toHaveBeenCalled();
    await hook.rerender({ open: true });
    expect(sheet.present).toHaveBeenCalledTimes(2);
  });

  it('Android back closes an open sheet and is consumed', async () => {
    const { close, sheet, backHandlers } = setup();
    await mount(true, close, sheet);
    expect(backHandlers).toHaveLength(1);
    let handled: boolean | null | undefined;
    await act(async () => {
      handled = backHandlers[0]!({} as never);
    });
    expect(handled).toBe(true);
    expect(close).toHaveBeenCalledTimes(1);
  });
});
