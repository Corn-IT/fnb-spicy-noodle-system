import { MdmCategory } from '@fnb/shared';
import { describe, expect, it, vi } from 'vitest';
import { MdmController } from '../mdm.controller';

const query = { category: MdmCategory.INGREDIENT, page: 1, limit: 20, activeOnly: true };

describe('MdmController', () => {
  it('should delegate the authenticated lookup query without applying an admin permission', async () => {
    const service = { lookup: vi.fn().mockResolvedValue([{ id: 1 }]) };
    const controller = new MdmController(service as never);

    await expect(controller.lookup(query)).resolves.toEqual([{ id: 1 }]);
    expect(service.lookup).toHaveBeenCalledWith(query);
  });

  it('should delegate management list, create, update and soft-disable operations', async () => {
    const service = {
      list: vi.fn().mockResolvedValue([]),
      findOrCreate: vi.fn().mockResolvedValue({ id: 1 }),
      update: vi.fn().mockResolvedValue({ id: 1 }),
      softDisable: vi.fn().mockResolvedValue({ id: 1, isActive: false }),
    };
    const controller = new MdmController(service as never);
    const created = { category: MdmCategory.INGREDIENT, name: 'Bún bò Huế', metadata: { last_price: 1 } };
    const updated = { name: 'Đá bi' };

    await controller.list(query);
    await controller.create(created);
    await controller.update(1, updated);
    await controller.disable(1);

    expect(service.list).toHaveBeenCalledWith(query);
    expect(service.findOrCreate).toHaveBeenCalledWith(MdmCategory.INGREDIENT, 'Bún bò Huế', { last_price: 1 });
    expect(service.update).toHaveBeenCalledWith(1, updated);
    expect(service.softDisable).toHaveBeenCalledWith(1);
  });
});
