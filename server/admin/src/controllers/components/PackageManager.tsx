import {
    Button,
    Form,
    Input,
    Popconfirm,
    Table,
  } from "antd";
import "antd/lib/popconfirm/style/css";
import "antd/lib/table/style/css";
import * as React from "react";
import { IPackage } from "../../definitions";
import * as utils from "../utils";

interface ICellProps {
    dataIndex: number;
    editable: boolean;
    handleEdit;
    index: number;
    record;
    title: string;
}

interface ICellState {
    editing: boolean;
}

const FormItem = Form.Item;
const EditableContext = React.createContext(null);

const EditableRow = ({ form, index, ...props }) => (
  <EditableContext.Provider value={form}>
    <tr {...props} />
  </EditableContext.Provider>
);

const EditableFormRow = Form.create()(EditableRow);

class EditableCell extends React.Component<ICellProps, ICellState> {

  public input: Input;
  public form: any;
  public state = {
    editing: false,
  };

  public toggleEdit = () => {
    const editing = !this.state.editing;
    this.setState({ editing }, () => {
      if (editing) {
        this.input.focus();
      }
    });
  }

  public toggle = (e) => {
    const { record, handleEdit } = this.props;
    this.form.validateFields((error, values) => {
      if (error && error[e.currentTarget.id]) {
        return;
      }
      this.toggleEdit();
      handleEdit({ ...record, ...values });
    });
  }

  public render() {
    const { editing } = this.state;
    const {
      editable,
      dataIndex,
      title,
      record,
      index,
      handleEdit,
      ...restProps
    } = this.props;
    return (
      <td {...restProps}>
        {editable ? (
          <EditableContext.Consumer>
            {(form) => {
              this.form = form;
              return (
                editing ? (
                  <FormItem style={{ margin: 0 }}>
                    {form.getFieldDecorator(dataIndex, {
                      initialValue: record[dataIndex],
                      rules: [{
                        message: `${title} is required.`,
                        required: true,
                      }],
                    })(
                      <Input
                        ref={(node) => (this.input = node)}
                        onPressEnter={this.toggle}
                        onBlur={this.toggle}
                      />,
                    )}
                  </FormItem>
                ) : (
                  <div
                    className="editable-cell-value-wrap"
                    style={{ paddingRight: 24 }}
                    onClick={this.toggleEdit}
                  >
                    {restProps.children}
                  </div>
                )
              );
            }}
          </EditableContext.Consumer>
        ) : restProps.children}
      </td>
    );
  }
}

interface ITableState {
    count: number;
    dataSource: IPackage[];
}

export interface ITableProps {
    data: IPackage[];
}

export class PackageManager extends React.Component<ITableProps, ITableState> {
  public columns: any;
  public edited = new Map<string, string>();
  constructor(props) {
    super(props);
    this.columns = [{
      dataIndex: "name",
      editable: true,
      title: "Package Name",
      width: "30%",
    },
    {
      dataIndex: "version",
      editable: true,
      title: "Version",
    },
    {
      dataIndex: "operation",
      render: (text, record: IPackage) => {
        console.log(`${record}`);
        const needSave = this.edited.has(record.name);
        const saveButton = needSave ? <a onClick={() => this.handleSave(record)}>Save</a> : null;
        return this.state.dataSource.length >= 0
          ? (
            <div>
              {saveButton}
              <Popconfirm title="Sure to delete?" onConfirm={() => this.handleDelete(record.name)}>
              <span> | </span>
              <a>Delete</a>
              </Popconfirm>
            </div>
          ) : null;
        },
      title: "operation",
    }];

    this.state = {
      count: this.props.data.length,
      dataSource: this.props.data,
    };
  }

  public handleDelete = (key: string) => {
    utils.deletePackage(document.location.origin, key).then((res) => {
      const dataSource = [...this.state.dataSource];
      this.setState({ dataSource: dataSource.filter((item) => item.name !== key) });
    }, (err) => {
      console.error(err);
    });
  }

  public handleAdd = () => {
    const { count, dataSource } = this.state;
    const newData = {
      name: `Package ${count}`,
      version: `0.0.0`,
    };
    this.setState({
      count: count + 1,
      dataSource: [...dataSource, newData],
    });
  }

  public handleSave = (newPackage: IPackage) => {
    utils.addPackage(document.location.origin, newPackage).then((res: IPackage) => {
      console.log(`Saved ${res.name}:${res.version}`);
      this.edited.delete(res.name);
      this.setState({ dataSource: [...this.state.dataSource] });
    }, (error) => {
      console.error(error);
    });
  }

  public handleEdit = (row: IPackage) => {
    console.log(`Name: ${row.name}, Version: ${row.version}`);
    this.edited.set(row.name, row.version);
    const newData = [...this.state.dataSource];
    const index = newData.findIndex((item) => row.name === item.name);
    const newItem = newData[index];
    newData.splice(index, 1, {
      ...newItem,
      ...row,
    });
    this.setState({ dataSource: newData });
  }

  public render() {
    const { dataSource } = this.state;
    const components = {
      body: {
        cell: EditableCell,
        row: EditableFormRow,
      },
    };
    const columns = this.columns.map((col) => {
      if (!col.editable) {
        return col;
      }
      return {
        ...col,
        onCell: (record) => ({
          dataIndex: col.dataIndex,
          editable: col.editable,
          handleEdit: this.handleEdit,
          record,
          title: col.title,
        }),
      };
    });
    return (
      <div>
        <Button onClick={this.handleAdd} type="primary" style={{ marginBottom: 16 }}>
          Add a row
        </Button>
        <Table
          components={components}
          rowClassName={() => "editable-row"}
          bordered
          dataSource={dataSource}
          columns={columns}
        />
      </div>
    );
  }
}
