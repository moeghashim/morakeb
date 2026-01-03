import React from 'react';
import { useDBNavigation } from './context';
import { TableList } from './screens/TableList';
import { TableViewer } from './screens/TableViewer';
import { RowEditor } from './screens/RowEditor';
import { ConfirmDelete } from './screens/ConfirmDelete';

export function DBScreenRouter() {
  const { screen } = useDBNavigation();
  
  switch (screen) {
    case 'table-list': return <TableList />;
    case 'table-viewer': return <TableViewer />;
    case 'row-editor': return <RowEditor />;
    case 'confirm-delete-row': return <ConfirmDelete />;
    default: return null;
  }
}
