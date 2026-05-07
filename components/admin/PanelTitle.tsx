import React from 'react'

interface props {
  title: string
}

const PanelTitle = ({title}: props) => {
  return (
    <div className="flex flex-wrap justify-between gap-2 px-3 pt-3 pb-2 sm:p-4">
      <h1 className="text-black capitalize text-lg sm:text-3xl md:text-4xl font-black leading-tight tracking-[-0.033em]">{title}</h1>
    </div>
  )
}

export default PanelTitle