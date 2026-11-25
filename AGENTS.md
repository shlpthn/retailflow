# Project Rules & Guidelines: RetailFlow

## UI Component Standard: shadcn/ui
- **Primary Component Library**: Luôn ưu tiên tái sử dụng và mở rộng các component từ `shadcn/ui` nằm tại `client/src/components/ui/` (`Button`, `Card`, `Badge`, `Dialog`, `Input`, `Label`, `Select`, `Table`, `Checkbox`, v.v.).
- **Không tự viết thẻ div styling thủ công** khi đã có sẵn component tương ứng (ví dụ: dùng `Badge` thay vì tự chế `<span className="...">`, dùng `Card` + `CardHeader` + `CardContent` thay vì custom card container).
- **Thêm component mới**: Khi cần component mới (như Tabs, DropdownMenu, Avatar, Tooltip, Sheet, v.v.), sử dụng lệnh CLI của project:
  ```bash
  cd client && npx shadcn@latest add <component_name>
  ```
- **Semantic Colors**: Sử dụng các token màu ngữ nghĩa từ hệ thống theme (`bg-background`, `bg-card`, `text-foreground`, `text-muted-foreground`, `bg-primary`, `border-border`) thay vì hardcode các mã màu ngẫu nhiên.
- **Tiện ích Class**: Luôn dùng hàm tiện ích `cn(...)` từ `@/lib/utils` để xử lý class có điều kiện, tránh nối chuỗi thủ công.
